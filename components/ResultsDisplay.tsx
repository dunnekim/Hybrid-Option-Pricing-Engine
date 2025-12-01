
import React from "react";
import { DealResult } from "../types";
import { downloadDealCSV } from "../utils/csvExport";
import { formatNumber } from "../utils/formatters";

interface Props {
  dealResult: DealResult | null;
}

const ResultsDisplay: React.FC<Props> = ({ dealResult }) => {
  if (!dealResult) {
    return (
      <div className="h-full bg-slate-100 rounded-xl flex items-center justify-center p-10 border border-dashed border-slate-300">
        <p className="text-slate-400 font-medium text-center">
            Set deal parameters to value portfolio.<br/>
            <span className="text-xs opacity-70">Add RCPS, CB, or ESO securities.</span>
        </p>
      </div>
    );
  }

  // Formatting helper: No scaling, just commas
  const fmt = (val: number) => formatNumber(val, 0);

  return (
    <div className="space-y-6 sticky top-6">
      
      {/* 1. Deal Summary Card */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
            <div>
                <h2 className="text-xs font-medium opacity-80 uppercase tracking-wide">Deal Total Fair Value</h2>
                <div className="text-3xl font-bold mt-1 font-mono tracking-tight">
                    {fmt(dealResult.deal_total_value)} <span className="text-sm font-sans font-normal opacity-70">KRW</span>
                </div>
            </div>
            <div className="text-right">
                <h2 className="text-xs font-medium opacity-60 uppercase tracking-wide">Price Per Share</h2>
                <div className="text-xl font-bold mt-1 font-mono text-blue-200">
                    {fmt(dealResult.deal_price_per_share)} <span className="text-xs font-sans font-normal opacity-70">KRW</span>
                </div>
            </div>
        </div>
        
        <div className="p-4 grid grid-cols-2 gap-4 border-b border-slate-100 bg-slate-50">
            <div>
                <span className="text-xs text-slate-500 uppercase font-bold">Host Sum</span>
                <div className="text-lg font-bold text-slate-700 font-mono">{fmt(dealResult.deal_total_host)}</div>
            </div>
            <div>
                <span className="text-xs text-slate-500 uppercase font-bold">Deriv Sum</span>
                <div className={`text-lg font-bold font-mono ${dealResult.deal_total_deriv >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                    {fmt(dealResult.deal_total_deriv)}
                </div>
            </div>
        </div>
        
        <div className="p-4 grid grid-cols-2 gap-4 bg-white">
             {/* Assets */}
             <div className="p-3 rounded bg-green-50/50 border border-green-100">
                 <div className="text-[10px] uppercase font-bold text-green-700 mb-1">Financial Assets</div>
                 <div className="flex justify-between text-sm">
                     <span className="text-slate-500">Total</span>
                     <span className="font-mono font-bold text-slate-800">{fmt(dealResult.deal_total_asset)}</span>
                 </div>
             </div>
             
             {/* Liabilities */}
             <div className="p-3 rounded bg-red-50/50 border border-red-100">
                 <div className="text-[10px] uppercase font-bold text-red-700 mb-1">Financial Liabilities</div>
                 <div className="flex justify-between text-sm">
                     <span className="text-slate-500">Total</span>
                     <span className="font-mono font-bold text-slate-800">{fmt(dealResult.deal_total_liab)}</span>
                 </div>
             </div>
        </div>
      </div>

      {/* 2. Portfolio Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">Portfolio Breakdown</h3>
              <button 
                onClick={() => downloadDealCSV(dealResult, "portfolio_valuation.csv")}
                className="text-xs flex items-center gap-1 text-slate-500 hover:text-blue-600 font-medium"
              >
                Export CSV
              </button>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                          <th className="p-3">Security</th>
                          <th className="p-3 text-right">Fair Value (Total)</th>
                          <th className="p-3 text-right text-slate-400">Host</th>
                          <th className="p-3 text-right text-blue-600">Deriv</th>
                          <th className="p-3 text-right">Eff. Conversion Price</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {dealResult.results.map(sec => {
                          const cp = sec.meta.eff_cp_final;
                          return (
                              <tr key={sec.id} className="hover:bg-slate-50/50">
                                  <td className="p-3">
                                      <div className="font-medium text-slate-800">{sec.name}</div>
                                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                                         <span className="text-[10px] text-slate-400 border border-slate-200 px-1 rounded">{sec.security_type}</span>
                                         <span className={`text-[10px] px-1 py-0.5 rounded border ${sec.position === 'HOLDER' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                                            {sec.position[0]}
                                         </span>
                                      </div>
                                  </td>
                                  <td className="p-3 text-right font-mono font-bold">{fmt(sec.fair_value_total)}</td>
                                  <td className="p-3 text-right font-mono text-slate-400">{fmt(sec.fair_value_host)}</td>
                                  <td className="p-3 text-right font-mono text-blue-600">{fmt(sec.fair_value_deriv)}</td>
                                  <td className="p-3 text-right font-mono text-slate-500">
                                      {cp ? fmt(cp) : "-"}
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>

    </div>
  );
};

export default ResultsDisplay;
