
import React, { useState, useEffect } from "react";
import { DealSchema, SecurityDef, SecurityType, AntiDilutionType, ResetEvent, ParticipationType } from "../types";
import { formatNumber } from "../utils/formatters";
import { addDays } from "../utils/tfEngine";

interface Props {
  deal: DealSchema;
  onChange: (data: DealSchema) => void;
  onAutoFetchToggle: (enabled: boolean, rating: string) => void;
  isAutoFetching: boolean;
  marketConfig: { rating: string, auto: boolean };
}

// Generate unique ID
const genId = () => Math.random().toString(36).substr(2, 9);

// --- Custom Inputs ---

const CurrencyInput = ({ 
    value, 
    onChange, 
    className, 
    placeholder,
    disabled
}: { 
    value: number | null | undefined, 
    onChange: (val: number) => void, 
    className?: string, 
    placeholder?: string,
    disabled?: boolean
}) => {
    const [display, setDisplay] = useState("");

    useEffect(() => {
        if (value !== undefined && value !== null) {
            setDisplay(formatNumber(value));
        } else {
            setDisplay("");
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (/^[0-9,.-]*$/.test(val)) {
            setDisplay(val);
        }
    };

    const handleBlur = () => {
        if (!display) return;
        const clean = display.replace(/,/g, '');
        const num = parseFloat(clean);
        if (!isNaN(num)) {
            onChange(num);
            setDisplay(formatNumber(num));
        } else {
             if (value !== undefined && value !== null) setDisplay(formatNumber(value));
             else setDisplay("");
        }
    };

    return (
        <input 
            type="text" 
            value={display} 
            onChange={handleChange} 
            onBlur={handleBlur}
            className={className}
            placeholder={placeholder}
            disabled={disabled}
        />
    );
};

const PercentInput = ({ 
    value, 
    onChange, 
    className,
    disabled
}: { 
    value: number, 
    onChange: (val: number) => void, 
    className?: string,
    disabled?: boolean
}) => {
    const [display, setDisplay] = useState("");

    useEffect(() => {
        if (value !== undefined && value !== null) {
            setDisplay((value * 100).toFixed(2));
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDisplay(e.target.value);
    };

    const handleBlur = () => {
        const num = parseFloat(display);
        if (!isNaN(num)) {
            onChange(num / 100.0);
            setDisplay(num.toFixed(2));
        } else {
             if (value !== undefined) setDisplay((value * 100).toFixed(2));
        }
    };

    return (
        <div className="relative w-full">
            <input 
                type="number" 
                step="0.01" 
                value={display} 
                onChange={handleChange} 
                onBlur={handleBlur} 
                className={className} 
                disabled={disabled}
            />
            <span className="absolute right-3 top-2.5 text-slate-400 text-xs font-bold">%</span>
        </div>
    );
};


const InputForm: React.FC<Props> = ({ deal, onChange, onAutoFetchToggle, isAutoFetching, marketConfig }) => {
  const [activeSecId, setActiveSecId] = useState<string | null>(deal.securities[0]?.id || null);

  const handleDealChange = (field: keyof DealSchema, val: any) => {
      onChange({ ...deal, [field]: val });
  };
  
  const handleMarketConfigChange = (field: string, val: any) => {
    const newRating = field === 'rating' ? val : marketConfig.rating;
    const newAuto = field === 'auto' ? val : marketConfig.auto;
    onAutoFetchToggle(newAuto, newRating);
  };

  const addSecurity = (type: SecurityType) => {
      const valDate = new Date(deal.valuation_date);
      const matDate = addDays(valDate, 365 * 3).toISOString().split('T')[0];

      const newSec: SecurityDef = {
          id: genId(),
          name: `New ${type}`,
          security_type: type,
          position: "HOLDER",
          
          total_issue_price: 1000000000,
          num_issued_shares: 50000,
          
          maturity_date: matDate,
          coupon_rate: 0.0,
          dividend_rate: 0.0,
          conversion_price: 20000,
          conversion_ratio: 0,
          
          anti_dilution_type: "NONE",
          refixing_floor_price: 14000, 
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
      onChange({ ...deal, securities: [...deal.securities, newSec] });
      setActiveSecId(newSec.id);
  };

  const removeSecurity = (id: string) => {
      const newSecs = deal.securities.filter(s => s.id !== id);
      onChange({ ...deal, securities: newSecs });
      if (activeSecId === id) setActiveSecId(null);
  };

  const updateSecurity = (id: string, field: keyof SecurityDef, val: any) => {
      const newSecs = deal.securities.map(s => s.id === id ? { ...s, [field]: val } : s);
      onChange({ ...deal, securities: newSecs });
  };
  
  const activeSec = deal.securities.find(s => s.id === activeSecId);
  const isESO = activeSec?.security_type === "ESO";
  const isCB = activeSec?.security_type === "CB";
  const isRCPS = activeSec?.security_type === "RCPS";
  const isPerShare = activeSec && !isESO && !isCB;

  // Helpers for Reset Events
  const addResetEvent = () => {
      if (!activeSec) return;
      const newEvent: ResetEvent = {
          event_date: deal.valuation_date,
          issue_price_new: activeSec.conversion_price,
          issue_shares_new: 0,
          shares_outstanding_before_reset: deal.underlying_num_shares
      };
      updateSecurity(activeSec.id, "reset_events", [...(activeSec.reset_events || []), newEvent]);
  };

  const updateResetEvent = (idx: number, field: keyof ResetEvent, val: any) => {
      if (!activeSec) return;
      const newEvents = [...(activeSec.reset_events || [])];
      newEvents[idx] = { ...newEvents[idx], [field]: val };
      updateSecurity(activeSec.id, "reset_events", newEvents);
  };

  const removeResetEvent = (idx: number) => {
      if (!activeSec) return;
      const newEvents = [...(activeSec.reset_events || [])];
      newEvents.splice(idx, 1);
      updateSecurity(activeSec.id, "reset_events", newEvents);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Global Deal Settings */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-800">Deal Parameters</h2>
            <div className="text-xs font-semibold text-slate-400">Unit: KRW (Won)</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Deal Name</label>
                <input type="text" value={deal.deal_name} onChange={(e) => handleDealChange("deal_name", e.target.value)} className="w-full p-2 border rounded text-sm" />
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Valuation Date</label>
                <input type="date" value={deal.valuation_date} onChange={(e) => handleDealChange("valuation_date", e.target.value)} className="w-full p-2 border rounded text-sm" />
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                    Share Price (S0) [KRW]
                </label>
                <CurrencyInput value={deal.share_price_current} onChange={(v) => handleDealChange("share_price_current", v)} className="w-full p-2 border rounded text-sm" />
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Common Volatility</label>
                <PercentInput value={deal.volatility} onChange={(v) => handleDealChange("volatility", v)} className="w-full p-2 border rounded text-sm" />
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Total Common Shares</label>
                <CurrencyInput value={deal.underlying_num_shares} onChange={(v) => handleDealChange("underlying_num_shares", v)} className="w-full p-2 border rounded text-sm" />
            </div>
        </div>
        
        {/* Market Data */}
        <div className="mt-4 pt-4 border-t border-slate-100">
             <div className="flex justify-between items-center mb-3">
                 <h3 className="text-xs font-bold text-slate-500 uppercase">Market Curves</h3>
                 <div className="flex items-center gap-2">
                     <label className="text-xs font-medium text-slate-600">Auto-Fetch</label>
                     <button onClick={() => handleMarketConfigChange('auto', !marketConfig.auto)} className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${marketConfig.auto ? 'bg-blue-600' : 'bg-slate-300'}`}>
                        <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${marketConfig.auto ? 'translate-x-4.5' : 'translate-x-0.5'}`}/>
                     </button>
                 </div>
             </div>
             {marketConfig.auto ? (
                 <div className="p-3 bg-blue-50 border border-blue-100 rounded text-sm">
                     <label className="block text-xs font-medium text-blue-800 mb-1">Credit Rating</label>
                     <select value={marketConfig.rating} onChange={(e) => handleMarketConfigChange('rating', e.target.value)} className="w-full p-1 border border-blue-200 rounded">
                        {["AAA", "AA+", "AA0", "A+", "A0", "BBB+", "BBB-"].map(r => <option key={r} value={r}>{r}</option>)}
                     </select>
                 </div>
             ) : (
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Risk Free (Flat)</label>
                        <PercentInput value={deal.risk_free_rate} onChange={(v) => handleDealChange("risk_free_rate", v)} className="w-full p-2 border rounded text-sm" />
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Credit Spread (Flat)</label>
                        <PercentInput value={deal.credit_spread} onChange={(v) => handleDealChange("credit_spread", v)} className="w-full p-2 border rounded text-sm" />
                     </div>
                 </div>
             )}
        </div>
      </div>

      {/* 2. Security Management */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
             <h2 className="text-lg font-bold text-slate-800">Securities</h2>
             <div className="flex gap-2">
                 <button onClick={() => addSecurity("RCPS")} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-medium rounded text-slate-700">+ RCPS</button>
                 <button onClick={() => addSecurity("CB")} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-medium rounded text-slate-700">+ CB</button>
                 <button onClick={() => addSecurity("ESO")} className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-xs font-medium rounded text-purple-700">+ ESO</button>
             </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 border-b border-slate-100">
            {deal.securities.map(sec => (
                <button 
                    key={sec.id} 
                    onClick={() => setActiveSecId(sec.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all border ${activeSecId === sec.id ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                    {sec.name}
                    <span onClick={(e) => { e.stopPropagation(); removeSecurity(sec.id); }} className="text-slate-400 hover:text-red-500 ml-1">×</span>
                </button>
            ))}
        </div>

        {activeSec && (
            <div className="animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="col-span-1 md:col-span-2 flex gap-4">
                        <div className="flex-1">
                             <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                             <input type="text" value={activeSec.name} onChange={(e) => updateSecurity(activeSec.id, "name", e.target.value)} className="w-full p-2 border rounded text-sm" />
                        </div>
                         <div className="flex-1">
                             <label className="block text-xs font-medium text-slate-600 mb-1">Position</label>
                             <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                                <button onClick={() => updateSecurity(activeSec.id, "position", "HOLDER")} className={`flex-1 py-1 text-xs font-medium rounded ${activeSec.position === "HOLDER" ? "bg-white text-green-700 shadow-sm" : "text-slate-500"}`}>Asset</button>
                                <button onClick={() => updateSecurity(activeSec.id, "position", "ISSUER")} className={`flex-1 py-1 text-xs font-medium rounded ${activeSec.position === "ISSUER" ? "bg-white text-red-700 shadow-sm" : "text-slate-500"}`}>Liab</button>
                             </div>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Maturity Date</label>
                        <input type="date" value={activeSec.maturity_date} onChange={(e) => updateSecurity(activeSec.id, "maturity_date", e.target.value)} className="w-full p-2 border rounded text-sm" />
                    </div>

                    {isESO && (
                        <>
                             <div>
                                <label className="block text-xs font-medium text-purple-700 mb-1">Number of Options</label>
                                <CurrencyInput value={activeSec.num_options} onChange={(v) => updateSecurity(activeSec.id, "num_options", v)} className="w-full p-2 border rounded text-sm" />
                             </div>
                             <div>
                                <label className="block text-xs font-medium text-purple-700 mb-1">Strike Price [KRW]</label>
                                <CurrencyInput value={activeSec.strike_price} onChange={(v) => updateSecurity(activeSec.id, "strike_price", v)} className="w-full p-2 border rounded text-sm" />
                             </div>
                             <div>
                                <label className="block text-xs font-medium text-purple-700 mb-1">Vesting Start</label>
                                <input type="date" value={activeSec.vesting_start_date || ""} onChange={(e) => updateSecurity(activeSec.id, "vesting_start_date", e.target.value)} className="w-full p-2 border rounded text-sm" />
                             </div>
                             <div>
                                <label className="block text-xs font-medium text-purple-700 mb-1">Vesting End</label>
                                <input type="date" value={activeSec.vesting_end_date || ""} onChange={(e) => updateSecurity(activeSec.id, "vesting_end_date", e.target.value)} className="w-full p-2 border rounded text-sm" />
                             </div>
                        </>
                    )}

                    {/* RCPS / CB / CPS Common */}
                    {!isESO && (
                        <>
                            {isCB ? (
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Total Issue Price (Face) [KRW]</label>
                                    <CurrencyInput value={activeSec.total_issue_price} onChange={(v) => updateSecurity(activeSec.id, "total_issue_price", v)} className="w-full p-2 border rounded text-sm" />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Total Issue Price [KRW]</label>
                                    <CurrencyInput value={activeSec.total_issue_price} onChange={(v) => updateSecurity(activeSec.id, "total_issue_price", v)} className="w-full p-2 border rounded text-sm" />
                                </div>
                            )}

                            {isPerShare && (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Number of Shares</label>
                                        <CurrencyInput value={activeSec.num_issued_shares} onChange={(v) => updateSecurity(activeSec.id, "num_issued_shares", v)} className="w-full p-2 border rounded text-sm" />
                                    </div>
                                    <div className="col-span-1 md:col-span-2 text-[10px] text-slate-400 -mt-2 mb-2">
                                        * Per Share Face Value: {formatNumber(activeSec.total_issue_price / (activeSec.num_issued_shares || 1), 0)} KRW
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Coupon Rate</label>
                                <PercentInput value={activeSec.coupon_rate} onChange={(v) => updateSecurity(activeSec.id, "coupon_rate", v)} className="w-full p-2 border rounded text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Dividend Rate</label>
                                <PercentInput value={activeSec.dividend_rate} onChange={(v) => updateSecurity(activeSec.id, "dividend_rate", v)} className="w-full p-2 border rounded text-sm" />
                            </div>
                             <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Repayment Premium</label>
                                <PercentInput value={activeSec.repayment_premium_rate || 0} onChange={(v) => updateSecurity(activeSec.id, "repayment_premium_rate", v)} className="w-full p-2 border rounded text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Conversion Price [KRW]</label>
                                <CurrencyInput value={activeSec.conversion_price} onChange={(v) => updateSecurity(activeSec.id, "conversion_price", v)} className="w-full p-2 border rounded text-sm" />
                            </div>
                        </>
                    )}

                    {/* RCPS Participation */}
                    {isRCPS && (
                         <div className="col-span-1 md:col-span-2 bg-blue-50 p-3 rounded mt-2 border border-blue-100">
                             <div className="flex justify-between items-center mb-2">
                                 <h3 className="text-xs font-bold text-blue-800">Participation Rights</h3>
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                                 <div>
                                     <label className="block text-[10px] font-medium text-blue-800 mb-1">Type</label>
                                     <select 
                                        value={activeSec.participation_type || "NON_PARTICIPATING"} 
                                        onChange={(e) => updateSecurity(activeSec.id, "participation_type", e.target.value)}
                                        className="w-full p-1 border border-blue-200 rounded text-xs"
                                     >
                                         <option value="NON_PARTICIPATING">Non-Participating</option>
                                         <option value="PARTICIPATING">Participating</option>
                                     </select>
                                 </div>
                                 {activeSec.participation_type === "PARTICIPATING" && (
                                     <div>
                                         <label className="block text-[10px] font-medium text-blue-800 mb-1">Cap Multiple (of Face)</label>
                                         <input 
                                            type="number" step="0.1" 
                                            value={activeSec.participation_cap_multiple || 2.0} 
                                            onChange={(e) => updateSecurity(activeSec.id, "participation_cap_multiple", parseFloat(e.target.value))}
                                            className="w-full p-1 border border-blue-200 rounded text-xs"
                                         />
                                     </div>
                                 )}
                             </div>
                         </div>
                    )}

                    {/* ANTI-DILUTION (Non-ESO) */}
                    {!isESO && (
                         <div className="col-span-1 md:col-span-2 bg-yellow-50 p-3 rounded mt-2 border border-yellow-100">
                             <div className="grid grid-cols-2 gap-4 mb-2">
                                 <div>
                                     <label className="block text-[10px] font-medium text-yellow-800 mb-1">Anti-Dilution Type</label>
                                     <select 
                                        value={activeSec.anti_dilution_type || "NONE"} 
                                        onChange={(e) => updateSecurity(activeSec.id, "anti_dilution_type", e.target.value)}
                                        className="w-full p-1 border border-yellow-200 rounded text-xs"
                                     >
                                         <option value="NONE">None</option>
                                         <option value="FULL_RATCHET">Full Ratchet</option>
                                         <option value="WA_DOWN_ONLY">WA Down-Only</option>
                                     </select>
                                 </div>
                                 {activeSec.anti_dilution_type !== "NONE" && (
                                    <div>
                                         <label className="block text-[10px] font-medium text-yellow-800 mb-1">Refixing Floor [KRW]</label>
                                         <CurrencyInput value={activeSec.refixing_floor_price} onChange={(v) => updateSecurity(activeSec.id, "refixing_floor_price", v)} className="w-full p-1 border border-yellow-200 rounded text-xs bg-white" placeholder="Floor Price" />
                                    </div>
                                 )}
                             </div>

                             {activeSec.anti_dilution_type !== "NONE" && (
                                 <div className="mt-2">
                                     <div className="flex justify-between items-center mb-1">
                                         <label className="text-[10px] font-bold text-yellow-800">Reset Events (Down Rounds)</label>
                                         <button onClick={addResetEvent} className="text-[10px] bg-yellow-200 hover:bg-yellow-300 px-2 py-0.5 rounded text-yellow-900">+ Add Event</button>
                                     </div>
                                     <div className="space-y-1">
                                         {(activeSec.reset_events || []).map((evt, idx) => (
                                             <div key={idx} className="grid grid-cols-4 gap-1 items-center">
                                                 <input type="date" value={evt.event_date} onChange={(e) => updateResetEvent(idx, "event_date", e.target.value)} className="text-[10px] border border-yellow-200 rounded p-1" />
                                                 <CurrencyInput value={evt.issue_price_new} onChange={(v) => updateResetEvent(idx, "issue_price_new", v)} placeholder="New Price" className="text-[10px] border border-yellow-200 rounded p-1" />
                                                 <CurrencyInput value={evt.issue_shares_new} onChange={(v) => updateResetEvent(idx, "issue_shares_new", v)} placeholder="New Shares" className="text-[10px] border border-yellow-200 rounded p-1" />
                                                 <button onClick={() => removeResetEvent(idx)} className="text-red-500 text-xs text-right px-2">×</button>
                                             </div>
                                         ))}
                                         {(activeSec.reset_events || []).length === 0 && (
                                             <div className="text-[10px] text-yellow-600 italic">No historical down-rounds added.</div>
                                         )}
                                     </div>
                                 </div>
                             )}
                         </div>
                    )}
                    
                    {/* Call/Put Options */}
                    {!isESO && (
                        <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded mt-2">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" checked={activeSec.has_call_option} onChange={(e) => updateSecurity(activeSec.id, "has_call_option", e.target.checked)} />
                                    <span className="text-xs font-semibold">Call Option</span>
                                </div>
                                {activeSec.has_call_option && (
                                    <div className="space-y-2 pl-4 border-l-2 border-slate-200">
                                        <CurrencyInput placeholder="Call Price" value={activeSec.call_price} onChange={(v) => updateSecurity(activeSec.id, "call_price", v)} className="w-full p-1 border rounded text-xs" />
                                        <input type="date" value={activeSec.call_start_date || ""} onChange={(e) => updateSecurity(activeSec.id, "call_start_date", e.target.value)} className="w-full p-1 border rounded text-xs" />
                                        <input type="date" value={activeSec.call_end_date || ""} onChange={(e) => updateSecurity(activeSec.id, "call_end_date", e.target.value)} className="w-full p-1 border rounded text-xs" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" checked={activeSec.has_put_option} onChange={(e) => updateSecurity(activeSec.id, "has_put_option", e.target.checked)} />
                                    <span className="text-xs font-semibold">Put Option</span>
                                </div>
                                {activeSec.has_put_option && (
                                    <div className="space-y-2 pl-4 border-l-2 border-slate-200">
                                        <CurrencyInput placeholder="Put Price" value={activeSec.put_price} onChange={(v) => updateSecurity(activeSec.id, "put_price", v)} className="w-full p-1 border rounded text-xs" />
                                        <input type="date" value={activeSec.put_start_date || ""} onChange={(e) => updateSecurity(activeSec.id, "put_start_date", e.target.value)} className="w-full p-1 border rounded text-xs" />
                                        <input type="date" value={activeSec.put_end_date || ""} onChange={(e) => updateSecurity(activeSec.id, "put_end_date", e.target.value)} className="w-full p-1 border rounded text-xs" />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default InputForm;
