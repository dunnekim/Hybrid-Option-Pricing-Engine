
import { SecuritySchema, PricingResult, NodeLogRow, PositionType } from "../types";

// --- Date Helpers ---
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function getDateDiffYears(d1: Date, d2: Date): number {
  return (d2.getTime() - d1.getTime()) / MS_PER_DAY / 365.0;
}

export interface TimeStep {
    step: number;
    date: Date;
    dateStr: string;
    t_years: number;
}

/**
 * Generates a weekly time grid from valuation_date to maturity_date.
 */
export function generateTimeGrid(valDateStr: string, matDateStr: string): TimeStep[] {
    const valDate = new Date(valDateStr);
    const matDate = new Date(matDateStr);

    if (matDate <= valDate) {
        return [
            { step: 0, date: valDate, dateStr: valDateStr, t_years: 0 },
            { step: 1, date: valDate, dateStr: valDateStr, t_years: 0.0027 }
        ];
    }

    const grid: TimeStep[] = [];
    let currentDate = new Date(valDate);
    let step = 0;

    // Add weekly steps
    while (currentDate < matDate) {
        grid.push({
            step,
            date: new Date(currentDate),
            dateStr: currentDate.toISOString().split('T')[0],
            t_years: getDateDiffYears(valDate, currentDate)
        });
        currentDate = addDays(currentDate, 7);
        step++;
    }

    // Ensure strict maturity date at the end
    grid.push({
        step,
        date: new Date(matDate),
        dateStr: matDate.toISOString().split('T')[0],
        t_years: getDateDiffYears(valDate, matDate)
    });

    return grid;
}

// --- ESO Logic ---
// (Unchanged from previous version)
function calculateESO(
  security: SecuritySchema,
  time_grid: TimeStep[],
  rf_t: number[],
  dt: number,
  u: number,
  d: number,
  N: number
): PricingResult {
  const {
    share_price_current: S0,
    strike_price = 0,
    num_options = 1,
    position = "HOLDER",
    vesting_end_date,
    employee_exit_rate = 0,
    early_exercise_multiple = 1000
  } = security;

  const S: number[][] = Array.from({ length: N + 1 }, (_, t) =>
    Array.from({ length: t + 1 }, (_, i) => S0 * Math.pow(u, i) * Math.pow(d, t - i))
  );

  const E: number[][] = Array.from({ length: N + 1 }, (_, t) => new Array(t + 1).fill(0));
  const Flags: string[][] = Array.from({ length: N + 1 }, (_, t) => new Array(t + 1).fill(""));

  // Terminal
  for (let i = 0; i <= N; i++) {
    const payoff = Math.max(S[N][i] - strike_price, 0);
    E[N][i] = payoff;
    Flags[N][i] = payoff > 0 ? "MATURITY_EXERCISE" : "MATURITY_LAPSE";
  }

  const vestingEnd = vesting_end_date ? new Date(vesting_end_date) : new Date(security.maturity_date);
  const survival_factor_step = Math.exp(-employee_exit_rate * dt);

  // Backward Induction
  for (let t = N - 1; t >= 0; t--) {
    const r_step = rf_t[t];
    const drift = Math.exp(r_step * dt);
    const q = (drift - d) / (u - d);
    const df = Math.exp(-r_step * dt);
    
    const stepDate = time_grid[t].date;
    const isVested = stepDate >= vestingEnd;

    for (let i = 0; i <= t; i++) {
      const S_ti = S[t][i];
      const E_next = q * E[t + 1][i + 1] + (1 - q) * E[t + 1][i];
      const continuation = E_next * df;
      
      let val = continuation;
      let flag = "HOLD";

      if (isVested) {
        const intrinsic = Math.max(S_ti - strike_price, 0);
        let exercise_allowed = false;
        if (S_ti >= early_exercise_multiple * strike_price) {
           exercise_allowed = true;
        }

        if (exercise_allowed && intrinsic > continuation) {
             val = intrinsic;
             flag = "EXERCISE_SUBOPT";
        }
      } else {
        flag = "UNVESTED";
      }

      E[t][i] = val * survival_factor_step;
      Flags[t][i] = flag;
    }
  }

  const V_per_option_long = E[0][0];
  const V_total_long = V_per_option_long * num_options;
  const sign = position === "ISSUER" ? -1 : 1;
  const V_total = V_total_long * sign;
  const V_per_opt = V_per_option_long * sign;

  return {
    fair_value_total: V_total,
    fair_value_per_share: V_per_opt,
    fair_value_host: 0,
    fair_value_deriv: V_total,
    fair_value_deriv_asset: V_total > 0 ? V_total : 0,
    fair_value_deriv_liab: V_total < 0 ? -V_total : 0,
    eso_val_per_option: V_per_opt,
    tf_debt_component: 0,
    tf_equity_component: V_per_option_long,
    node_logs: [],
    meta: {
        dt, u, d, N,
        valuation_date: security.valuation_date,
        maturity_date: security.maturity_date,
        used_curve_source: security.stepwise_risk_free_rates ? "Bootstrapped Curve" : "Flat Rate"
    }
  };
}

// --- TF Hybrid Logic (RCPS, CB, CPS) ---

function calculateTF(
  security: SecuritySchema,
  time_grid: TimeStep[],
  rf_t: number[],
  cs_t: number[],
  dt: number,
  u: number,
  d: number,
  N: number
): PricingResult {
  const {
    share_price_current: S0,
    position = "HOLDER",
    total_issue_price,
    num_issued_shares = 1,
    conversion_price: initial_cp,
    security_type,
    repayment_premium_rate = 0,
    coupon_rate = 0,
    dividend_rate = 0,
    conversion_ratio: override_ratio,
    
    // Anti-dilution
    anti_dilution_type = "NONE",
    refixing_floor_price,
    reset_events = [],

    // RCPS Participation
    participation_type = "NON_PARTICIPATING",
    participation_cap_multiple
  } = security;

  const isCB = security_type === "CB";
  const isPerShare = !isCB; // RCPS, CPS

  // --- 1. Define Calculation Unit ---
  let unit_face_value = 0;
  let unit_redemption_value = 0;
  let unit_periodic_cf = 0;

  if (isPerShare) {
      unit_face_value = total_issue_price / num_issued_shares;
      unit_redemption_value = unit_face_value * (1 + repayment_premium_rate);
      const total_rate = coupon_rate + dividend_rate;
      unit_periodic_cf = (unit_face_value * total_rate) * dt;
  } else {
      unit_face_value = total_issue_price;
      unit_redemption_value = unit_face_value * (1 + repayment_premium_rate);
      unit_periodic_cf = (unit_face_value * coupon_rate) * dt;
  }

  // --- 2. Build Refixing Schedule ---
  // Pre-calculate CP at each step
  const cp_at_step: number[] = new Array(N + 1).fill(initial_cp);
  
  if (anti_dilution_type !== "NONE" && reset_events.length > 0) {
      let current_cp = initial_cp;
      const sortedEvents = [...reset_events].sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
      
      let eventIdx = 0;
      for (let t = 0; t <= N; t++) {
          const stepDate = time_grid[t].date;
          
          while (eventIdx < sortedEvents.length && new Date(sortedEvents[eventIdx].event_date) <= stepDate) {
              const evt = sortedEvents[eventIdx];
              // Calculate New CP
              if (evt.issue_price_new < current_cp) {
                  if (anti_dilution_type === "FULL_RATCHET") {
                      current_cp = evt.issue_price_new;
                  } else if (anti_dilution_type === "WA_DOWN_ONLY") {
                      // Broad-based weighted average
                      const SO = evt.shares_outstanding_before_reset || 1000000; // Fallback
                      const SP_new = evt.issue_price_new;
                      const SN_new = evt.issue_shares_new;
                      const CP_old = current_cp;
                      
                      const num = SO + (SP_new / CP_old) * SN_new;
                      const den = SO + SN_new;
                      current_cp = CP_old * (num / den);
                  }
                  
                  // Apply Floor
                  if (refixing_floor_price && current_cp < refixing_floor_price) {
                      current_cp = refixing_floor_price;
                  }
              }
              eventIdx++;
          }
          cp_at_step[t] = current_cp;
      }
  }

  const getEffectiveConversionRatio = (t: number): number => {
      if (override_ratio && override_ratio > 0 && anti_dilution_type === "NONE") {
          return override_ratio;
      }
      return unit_face_value / cp_at_step[t];
  };


  // --- 3. Lattice Construction ---
  const S: number[][] = Array.from({ length: N + 1 }, (_, t) =>
    Array.from({ length: t + 1 }, (_, i) => S0 * Math.pow(u, i) * Math.pow(d, t - i))
  );

  const D: number[][] = Array.from({ length: N + 1 }, (_, t) => new Array(t + 1).fill(0));
  const E: number[][] = Array.from({ length: N + 1 }, (_, t) => new Array(t + 1).fill(0));
  const Flags: string[][] = Array.from({ length: N + 1 }, (_, t) => new Array(t + 1).fill(""));
  // To verify refixing in logs
  const CP_Log: number[][] = Array.from({ length: N + 1 }, (_, t) => new Array(t + 1).fill(initial_cp));

  // --- 4. Terminal Condition ---
  for (let i = 0; i <= N; i++) {
    const S_T = S[N][i];
    const ratio = getEffectiveConversionRatio(N);
    CP_Log[N][i] = unit_face_value / ratio; // Back-calc CP for logging

    const val_convert_base = S_T * ratio;
    
    // Payoff Logic Branching
    let payoff_hold = 0; // Value if we don't convert (Redemption)
    let payoff_conv = 0; // Value if we convert
    
    const redeem_val = unit_redemption_value + unit_periodic_cf;
    payoff_hold = redeem_val;

    if (security_type === "RCPS" && participation_type === "PARTICIPATING") {
        // Participating Payoff: Liquidation Pref + (Convert Value OR Residual). 
        // Standard Model: Max(Simple Conversion, min(Cap, Liquidation + Residual_as_converted))
        // Simplified Vibe Spec: "Prioritize Liquidation, then Pro-rata"
        // Interpretation: Payoff = Liquidation + (S_T * Ratio)
        // With Cap: min(Uncapped, Face * Cap)
        // Also must compare with "Voluntary Conversion" (Giving up Pref) which is just S_T * Ratio
        
        // 1. Double Dip Value
        let double_dip = redeem_val + val_convert_base;
        if (participation_cap_multiple) {
            double_dip = Math.min(double_dip, unit_face_value * participation_cap_multiple);
        }
        
        // 2. Simple Conversion (Giving up pref to escape cap)
        // Usually converting means losing the redemption right. 
        // So we take max(Double Dip, Simple Conversion)
        payoff_conv = Math.max(double_dip, val_convert_base);
    } else {
        // Non-Participating (Standard RCPS / CB / CPS)
        payoff_conv = val_convert_base;
    }

    if (payoff_conv > payoff_hold) {
      D[N][i] = 0; // Debt part extinguished
      E[N][i] = payoff_conv;
      Flags[N][i] = participation_type === "PARTICIPATING" ? "MAT_PARTICIPATE" : "MAT_CONVERT";
    } else {
      D[N][i] = payoff_hold;
      E[N][i] = 0;
      Flags[N][i] = "MAT_REDEEM";
    }
  }

  // --- 5. Backward Induction ---
  for (let t = N - 1; t >= 0; t--) {
    const r_step = rf_t[t];
    const cs_step = cs_t[t];
    const q = (Math.exp(r_step * dt) - d) / (u - d); 
    const df_rf = Math.exp(-r_step * dt);
    const df_risky = Math.exp(-(r_step + cs_step) * dt);
    
    const stepDate = time_grid[t].date;
    
    // Options
    let can_call = false;
    if (security.has_call_option && security.call_price !== null) {
        const start = security.call_start_date ? new Date(security.call_start_date) : null;
        const end = security.call_end_date ? new Date(security.call_end_date) : new Date(security.maturity_date);
        if (start && stepDate >= start && stepDate <= end) can_call = true;
    }
    let can_put = false;
    if (security.has_put_option && security.put_price !== null) {
        const start = security.put_start_date ? new Date(security.put_start_date) : null;
        const end = security.put_end_date ? new Date(security.put_end_date) : new Date(security.maturity_date);
        if (start && stepDate >= start && stepDate <= end) can_put = true;
    }

    for (let i = 0; i <= t; i++) {
      const S_ti = S[t][i];
      const ratio = getEffectiveConversionRatio(t);
      CP_Log[t][i] = unit_face_value / ratio;

      // Rollback
      const E_D = q * D[t + 1][i + 1] + (1 - q) * D[t + 1][i];
      const E_E = q * E[t + 1][i + 1] + (1 - q) * E[t + 1][i];

      let D_cont = E_D * df_risky;
      let E_cont = E_E * df_rf;
      D_cont += unit_periodic_cf;

      let V_hold = D_cont + E_cont;
      let D_final = D_cont;
      let E_final = E_cont;
      let flag = "HOLD";

      // Calculate Conversion Value (Same logic as terminal)
      const val_convert_base = S_ti * ratio;
      let val_convert_opt = val_convert_base;

      if (security_type === "RCPS" && participation_type === "PARTICIPATING") {
          // Participating Early Conversion usually implies simplified "Convert and Sell"
          // Or "Convert and Hold Common".
          // In American option models, "Exercise" means "Convert Now".
          // If you convert now, you usually get Common Stock.
          // You do NOT get the Liquidation Preference *now* unless it's a liquidation event.
          // BUT, TF model values the security.
          // If the model assumes conversion happens *at* maturity or optimally:
          // "Convert Now" usually means turning into Common Stock immediately.
          // Does converting now give you the participation right? No, converting makes you common.
          // So Early Exercise Value = S_ti * Ratio.
          val_convert_opt = val_convert_base;
          // The "Participation" benefit is embedded in the *Holding Value* (waiting for maturity liquidation).
      } 

      // 1. Check Conversion (Rational Holder)
      if (val_convert_opt > V_hold) {
          V_hold = val_convert_opt;
          D_final = 0;
          E_final = val_convert_opt;
          flag = "CONVERT";
      }

      // 2. Call Option (Issuer)
      if (can_call && security.call_price !== null) {
          const call_strike = security.call_price;
          // If called, holder maximizes (Call Strike, Conversion)
          const holder_val = Math.max(call_strike, val_convert_opt);
          if (holder_val < V_hold) {
              V_hold = holder_val;
              flag = "CALLED";
              if (val_convert_opt > call_strike) {
                  D_final = 0;
                  E_final = val_convert_opt;
                  flag = "CALLED_FORCE_CONV";
              } else {
                  D_final = call_strike;
                  E_final = 0;
              }
          }
      }

      // 3. Put Option (Holder)
      if (can_put && security.put_price !== null) {
          const put_strike = security.put_price;
          if (put_strike > V_hold) {
              V_hold = put_strike;
              D_final = put_strike;
              E_final = 0;
              flag = "PUT";
          }
      }

      D[t][i] = D_final;
      E[t][i] = E_final;
      Flags[t][i] = flag;
    }
  }

  // --- 6. Host Contract (Pure DCF) ---
  let host_val_unit = 0;
  let df_accum = 1.0;
  for (let t_step = 0; t_step < N; t_step++) {
      const r = rf_t[t_step];
      const cs = cs_t[t_step];
      const step_df = Math.exp(-(r + cs) * dt);
      df_accum *= step_df;
      host_val_unit += unit_periodic_cf * df_accum;
  }
  host_val_unit += unit_redemption_value * df_accum;

  // --- 7. Aggregation ---
  const hybrid_val_unit = D[0][0] + E[0][0];
  const deriv_val_unit = hybrid_val_unit - host_val_unit;

  let total_hybrid_long = 0;
  let total_host_long = 0;
  let total_deriv_long = 0;

  if (isPerShare) {
      total_hybrid_long = hybrid_val_unit * num_issued_shares;
      total_host_long = host_val_unit * num_issued_shares;
      total_deriv_long = deriv_val_unit * num_issued_shares;
  } else {
      total_hybrid_long = hybrid_val_unit;
      total_host_long = host_val_unit;
      total_deriv_long = deriv_val_unit;
  }

  const sign = position === "ISSUER" ? -1 : 1;

  // --- 8. Logs ---
  const node_logs: NodeLogRow[] = [];
  // Sample logs
  for (let t = 0; t <= Math.min(N, 5); t++) {
    const r_log = t < N ? rf_t[t] : 0;
    const dateStr = time_grid[t].dateStr;
    for (let i = 0; i <= t; i++) {
      node_logs.push({
        t, i,
        date: dateStr,
        node_id: `t${t}_i${i}`,
        S_ti: S[t][i],
        D_ti: D[t][i],
        E_ti: E[t][i],
        V_ti: D[t][i] + E[t][i],
        event_flag: Flags[t][i],
        q_up: 0,
        rf_t: r_log,
        cs_t: 0,
        conversion_price_eff: cp_at_step[t]
      });
    }
  }

  return {
    fair_value_total: total_hybrid_long * sign,
    fair_value_per_share: isPerShare ? (hybrid_val_unit * sign) : undefined,
    fair_value_host: total_host_long * sign,
    fair_value_deriv: total_deriv_long * sign,
    fair_value_deriv_asset: Math.max(total_deriv_long * sign, 0),
    fair_value_deriv_liab: Math.max(-(total_deriv_long * sign), 0),
    tf_debt_component: D[0][0],
    tf_equity_component: E[0][0],
    node_logs,
    meta: {
      dt, u, d, N,
      valuation_date: security.valuation_date,
      maturity_date: security.maturity_date,
      used_curve_source: security.stepwise_risk_free_rates ? "Bootstrapped Curve" : "Flat Rate",
      eff_cp_final: cp_at_step[N]
    }
  };
}

export function runPricingEngine(security: SecuritySchema): PricingResult {
    // 1. Time Grid
    const time_grid = generateTimeGrid(security.valuation_date, security.maturity_date);
    const N = time_grid.length - 1;

    if (N <= 0) {
        return {
            fair_value_total: 0,
            fair_value_host: 0,
            fair_value_deriv: 0,
            fair_value_deriv_asset: 0,
            fair_value_deriv_liab: 0,
            tf_debt_component: 0,
            tf_equity_component: 0,
            node_logs: [],
            meta: {
                dt: 0, u: 0, d: 0, N: 0,
                valuation_date: security.valuation_date,
                maturity_date: security.maturity_date
            }
        };
    }

    const T = time_grid[N].t_years;
    const dt = T / N;

    // 2. CRR Parameters
    const sigma = security.volatility;
    const u = Math.exp(sigma * Math.sqrt(dt));
    const d = 1 / u;

    // 3. Rates
    let rf_t: number[];
    if (security.stepwise_risk_free_rates && security.stepwise_risk_free_rates.length >= N) {
        rf_t = security.stepwise_risk_free_rates.slice(0, N);
    } else {
        rf_t = new Array(N).fill(security.risk_free_rate);
    }

    let cs_t: number[];
    if (security.stepwise_credit_spreads && security.stepwise_credit_spreads.length >= N) {
        cs_t = security.stepwise_credit_spreads.slice(0, N);
    } else {
        cs_t = new Array(N).fill(security.credit_spread);
    }

    // 4. Run
    if (security.security_type === "ESO") {
        return calculateESO(security, time_grid, rf_t, dt, u, d, N);
    } else {
        return calculateTF(security, time_grid, rf_t, cs_t, dt, u, d, N);
    }
}
