import React from "react";
import { CurvePoint, ZeroCurvePoint } from "../types";

interface Props {
  rfCurve: CurvePoint[] | null;
  csCurve: CurvePoint[] | null;
  zeroRf: ZeroCurvePoint[] | null;
  stepwiseRf: number[] | null;
}

const CurveDebugger: React.FC<Props> = ({ rfCurve, csCurve, zeroRf, stepwiseRf }) => {
  if (!rfCurve || !csCurve) return null;

  return (
    <div className="mt-6 bg-white p-6 rounded-xl border border-slate-200">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
        Market Data & Curves Verification
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">1. Interpolated Yield Curves</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-1">Tenor (Y)</th>
                  <th className="py-1">Risk-Free Yield</th>
                  <th className="py-1">Credit Spread</th>
                </tr>
              </thead>
              <tbody>
                {rfCurve.map((pt, idx) => (
                  <tr key={idx} className="border-b border-slate-50">
                    <td className="py-1 font-mono">{pt.tenor_years}</td>
                    <td className="py-1">{(pt.rate * 100).toFixed(3)}%</td>
                    <td className="py-1 text-slate-500">
                        {csCurve[idx] ? (csCurve[idx].rate * 10000).toFixed(0) + " bps" : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
           <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">2. Bootstrapped Zero Rates</h4>
           <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-1">Tenor</th>
                  <th className="py-1">Zero Rate</th>
                  <th className="py-1">DF</th>
                </tr>
              </thead>
              <tbody>
                 {zeroRf && zeroRf.map((pt, idx) => (
                  <tr key={idx} className="border-b border-slate-50">
                    <td className="py-1 font-mono">{pt.tenor_years}</td>
                    <td className="py-1 text-blue-600">{(pt.zero_rate * 100).toFixed(3)}%</td>
                    <td className="py-1 font-mono text-slate-500">{pt.discount_factor.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100">
         <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">3. Engine Input Sample (First 5 Steps)</h4>
         <div className="flex gap-2 text-xs font-mono text-slate-600">
            {stepwiseRf && stepwiseRf.slice(0, 5).map((r, i) => (
                <div key={i} className="bg-slate-100 px-2 py-1 rounded">
                    t={i}: {(r * 100).toFixed(4)}%
                </div>
            ))}
            <span>...</span>
         </div>
      </div>
    </div>
  );
};

export default CurveDebugger;
