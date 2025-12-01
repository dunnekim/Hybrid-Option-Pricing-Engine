
import React, { useState, useEffect } from "react";
import InputForm from "./components/InputForm";
import ResultsDisplay from "./components/ResultsDisplay";
import CurveDebugger from "./components/CurveDebugger";
import { DealSchema, DealResult, SecurityDef, CurvePoint, ZeroCurvePoint, SecuritySchema, SecurityResult } from "./types";
import { runPricingEngine, generateTimeGrid, addDays } from "./utils/tfEngine";
import { fetchMarketData, buildCurves } from "./utils/marketData";
import { bootstrapZeroCurve, buildStepwiseRates } from "./utils/bootstrapper";

// Default Dates
const today = new Date().toISOString().split('T')[0];
const threeYearsLater = new Date(new Date().setFullYear(new Date().getFullYear() + 3)).toISOString().split('T')[0];

const DEFAULT_SECURITY_TEMPLATE: SecurityDef = {
  id: "1",
  name: "Series A RCPS",
  security_type: "RCPS",
  position: "HOLDER",
  
  total_issue_price: 1000000000,
  num_issued_shares: 50000,
  
  maturity_date: threeYearsLater,
  coupon_rate: 0.02,
  dividend_rate: 0.0,
  repayment_premium_rate: 0.05,
  conversion_price: 20000,
  
  anti_dilution_type: "FULL_RATCHET",
  refixing_floor_price: 14000, // 70% of 20k
  reset_events: [],
  
  participation_type: "NON_PARTICIPATING",
  participation_cap_multiple: 2.0,

  liquidation_preference: 1.0,
  has_call_option: false,
  call_price: null,
  has_put_option: false,
  put_price: null,
  num_options: 0,
  strike_price: 0,
  early_exercise_multiple: 2.0
};

const DEFAULT_DEAL: DealSchema = {
    deal_name: "Sample Portfolio",
    valuation_date: today,
    share_price_current: 20000, // S0
    underlying_num_shares: 1000000,
    volatility: 0.35,
    risk_free_rate: 0.035,
    credit_spread: 0.02,
    securities: [DEFAULT_SECURITY_TEMPLATE]
};

function App() {
  const [deal, setDeal] = useState<DealSchema>(DEFAULT_DEAL);
  const [dealResult, setDealResult] = useState<DealResult | null>(null);

  // Market Configuration State
  const [marketConfig, setMarketConfig] = useState({ 
    rating: "A0", 
    auto: false 
  });
  const [isFetching, setIsFetching] = useState(false);
  
  const [debugCurves, setDebugCurves] = useState<{
    rfCurve: CurvePoint[] | null;
    csCurve: CurvePoint[] | null;
    zeroRf: ZeroCurvePoint[] | null;
  }>({ rfCurve: null, csCurve: null, zeroRf: null });

  // Main Deal Calculation Engine
  useEffect(() => {
    const calculateDeal = async () => {
        let zeroRf: ZeroCurvePoint[] = [];
        
        if (marketConfig.auto && debugCurves.zeroRf) {
            zeroRf = debugCurves.zeroRf;
        }

        const securityResults: SecurityResult[] = [];

        // 2. Iterate Securities
        for (const secDef of deal.securities) {
            try {
                let stepwise_rf: number[] | undefined = undefined;
                let stepwise_cs: number[] | undefined = undefined;

                if (marketConfig.auto && zeroRf.length > 0) {
                     const grid = generateTimeGrid(deal.valuation_date, secDef.maturity_date);
                     const N = grid.length - 1;
                     if (N > 0) {
                        const T = grid[N].t_years;
                        const dt = T / N;
                        const rates = buildStepwiseRates(
                             zeroRf, 
                             (debugCurves.csCurve && debugCurves.zeroRf) ? bootstrapZeroCurve(debugCurves.csCurve) : [], 
                             N, dt
                        );
                        stepwise_rf = rates.rf_t;
                        stepwise_cs = rates.cs_t;
                     }
                }

                // Construct Full Schema
                const fullSec: SecuritySchema = {
                    ...secDef,
                    valuation_date: deal.valuation_date,
                    share_price_current: deal.share_price_current, // Injected common S0
                    volatility: deal.volatility,
                    risk_free_rate: deal.risk_free_rate,
                    credit_spread: deal.credit_spread,
                    stepwise_risk_free_rates: stepwise_rf,
                    stepwise_credit_spreads: stepwise_cs
                };

                const res = runPricingEngine(fullSec);
                
                securityResults.push({
                    ...res,
                    id: secDef.id,
                    name: secDef.name,
                    security_type: secDef.security_type,
                    position: secDef.position
                });

            } catch (e) {
                console.error(`Error pricing security ${secDef.name}`, e);
            }
        }

        // 3. Aggregate
        const agg = securityResults.reduce((acc, curr) => ({
            total: acc.total + curr.fair_value_total,
            host: acc.host + curr.fair_value_host,
            deriv: acc.deriv + curr.fair_value_deriv,
            asset: acc.asset + (curr.fair_value_total > 0 ? curr.fair_value_total : 0),
            liab: acc.liab + (curr.fair_value_total < 0 ? -curr.fair_value_total : 0),
            deriv_asset: acc.deriv_asset + curr.fair_value_deriv_asset,
            deriv_liab: acc.deriv_liab + curr.fair_value_deriv_liab
        }), { total: 0, host: 0, deriv: 0, asset: 0, liab: 0, deriv_asset: 0, deriv_liab: 0 });

        setDealResult({
            deal_total_value: agg.total,
            deal_price_per_share: deal.underlying_num_shares > 0 ? agg.total / deal.underlying_num_shares : 0,
            deal_total_host: agg.host,
            deal_total_deriv: agg.deriv,
            deal_total_asset: agg.asset,
            deal_total_liab: agg.liab,
            deal_total_deriv_asset: agg.deriv_asset,
            deal_total_deriv_liab: agg.deriv_liab,
            results: securityResults
        });
    };

    calculateDeal();
  }, [deal, marketConfig, debugCurves]); 

  // Auto-Fetch Logic
  const handleAutoFetchToggle = async (enabled: boolean, rating: string) => {
    setMarketConfig({ rating, auto: enabled });
    
    if (enabled) {
        setIsFetching(true);
        try {
            const marketData = await fetchMarketData(deal.valuation_date, rating);
            const { rf_curve, cs_curve } = buildCurves(marketData);
            const zeroRf = bootstrapZeroCurve(rf_curve);
            setDebugCurves({ rfCurve: rf_curve, csCurve: cs_curve, zeroRf });
        } catch (error) {
            console.error("Failed to fetch market data", error);
        } finally {
            setIsFetching(false);
        }
    } else {
        setDebugCurves({ rfCurve: null, csCurve: null, zeroRf: null });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-blue-200 shadow-lg">V</div>
            <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">Hybrid Option Pricing Engine</h1>
                <p className="text-xs text-slate-500 font-medium">Portfolio & Cap Table Valuation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <div className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded">v2.3 Anti-Dilution</div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-6">
            <InputForm 
                deal={deal}
                onChange={setDeal}
                onAutoFetchToggle={handleAutoFetchToggle}
                isAutoFetching={isFetching}
                marketConfig={marketConfig}
            />
            {marketConfig.auto && (
                <CurveDebugger 
                    rfCurve={debugCurves.rfCurve} 
                    csCurve={debugCurves.csCurve} 
                    zeroRf={debugCurves.zeroRf}
                    stepwiseRf={null}
                />
            )}
          </div>
          <div className="lg:col-span-5">
            <ResultsDisplay dealResult={dealResult} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
