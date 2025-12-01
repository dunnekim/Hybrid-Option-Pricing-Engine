
import { DealResult } from "../types";

export function downloadDealCSV(dealResult: DealResult, filename: string) {
  const { results } = dealResult;
  const val = (n: number) => n.toFixed(0); 
  
  // SECTION 1: DEAL SUMMARY
  const summaryHeader = ["--- DEAL SUMMARY ---", "Unit: KRW"];
  const summaryRows = [
      ["Deal Price Per Share", val(dealResult.deal_price_per_share)],
      ["Total Fair Value", val(dealResult.deal_total_value)],
      ["Total Host", val(dealResult.deal_total_host)],
      ["Total Derivative", val(dealResult.deal_total_deriv)],
      ["Total Financial Assets", val(dealResult.deal_total_asset)],
      ["Total Financial Liabilities", val(dealResult.deal_total_liab)],
  ];

  // SECTION 2: PORTFOLIO TABLE
  const portHeader = ["--- SECURITY SUMMARY ---"];
  const portCols = ["ID", "Name", "Type", "Position", "Per_Share_Val", "Total_Val", "Host", "Deriv", "Deriv_Asset", "Deriv_Liab", "Final_Eff_CP"];
  const portRows = results.map(r => [
      r.id,
      r.name,
      r.security_type,
      r.position,
      r.fair_value_per_share ? val(r.fair_value_per_share) : "-",
      val(r.fair_value_total),
      val(r.fair_value_host),
      val(r.fair_value_deriv),
      val(r.fair_value_deriv_asset),
      val(r.fair_value_deriv_liab),
      r.meta.eff_cp_final ? val(r.meta.eff_cp_final) : "-"
  ]);

  // SECTION 3: NODE LOGS
  const logHeader = ["--- NODE LOGS ---"];
  const logCols = [
    "Security Name",
    "Date",
    "t",
    "i",
    "S_ti",
    "Eff_CP", 
    "D_ti_or_Opt",
    "E_ti_or_Opt",
    "V_ti",
    "Event Flag",
    "q_up",
    "r_t"
  ];

  const logRows: string[][] = [];
  results.forEach(res => {
     res.node_logs.forEach(log => {
         logRows.push([
             res.name,
             log.date,
             log.t.toString(),
             log.i.toString(),
             log.S_ti.toFixed(2),
             log.conversion_price_eff ? log.conversion_price_eff.toFixed(2) : "-",
             log.D_ti.toFixed(2),
             log.E_ti.toFixed(2),
             log.V_ti.toFixed(2),
             log.event_flag,
             log.q_up.toFixed(6),
             (log.rf_t * 100).toFixed(4) + "%"
         ]);
     });
  });

  // COMPOSE CSV CONTENT
  const join = (rows: string[][]) => rows.map(r => r.join(",")).join("\n");
  
  const csvContent = [
      summaryHeader.join(","),
      join(summaryRows),
      "",
      portHeader.join(","),
      portCols.join(","),
      join(portRows),
      "",
      logHeader.join(","),
      logCols.join(","),
      join(logRows)
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
