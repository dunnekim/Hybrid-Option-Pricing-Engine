
export type SecurityType = "RCPS" | "CB" | "CPS" | "ESO";
export type PositionType = "HOLDER" | "ISSUER";

export type AntiDilutionType = "NONE" | "FULL_RATCHET" | "WA_DOWN_ONLY";
export type ParticipationType = "NON_PARTICIPATING" | "PARTICIPATING";

export interface ResetEvent {
    event_date: string;
    issue_price_new: number;
    issue_shares_new: number; // For WA
    shares_outstanding_before_reset?: number; // For WA (Broad-based)
}

// The core schema required by the Pricing Engine
export interface SecuritySchema {
  security_type: SecurityType;
  position: PositionType;
  
  // New Amount Fields
  total_issue_price: number; // Total Face Amount (KRW)
  num_issued_shares: number; // For RCPS/CPS/ESO
  share_price_current: number; // S0 (KRW)

  // Date-based inputs
  valuation_date: string; // YYYY-MM-DD
  maturity_date: string;  // YYYY-MM-DD
  
  coupon_rate: number; // Annual rate
  dividend_rate: number; // Annual rate
  repayment_premium_rate?: number; // Repayment Premium

  conversion_price: number; // KRW per share
  conversion_ratio?: number | null; // Explicit ratio (overrides price)

  // Refixing / Anti-dilution
  has_refixing?: boolean; // Legacy flag, mapping to anti_dilution_type != NONE
  anti_dilution_type: AntiDilutionType;
  refixing_floor_price?: number; // KRW
  reset_events?: ResetEvent[]; // History of down rounds
  
  // RCPS Participation
  participation_type?: ParticipationType;
  participation_cap_multiple?: number; // e.g. 2.0x

  // Market Params (Injected from Deal Level)
  volatility: number;
  
  // Rate Inputs
  risk_free_rate: number; // Flat rate fallback
  credit_spread: number; // Flat rate fallback

  // Computed / Bootstrapped Arrays
  stepwise_risk_free_rates?: number[]; // Length N
  stepwise_credit_spreads?: number[]; // Length N
  
  liquidation_preference: number; // Multiple, e.g. 1.0
  
  // Option Flags (American Date-Based)
  has_call_option: boolean;
  call_price: number | null; // KRW
  call_start_date?: string; // YYYY-MM-DD
  call_end_date?: string;   // YYYY-MM-DD

  has_put_option: boolean;
  put_price: number | null; // KRW
  put_start_date?: string; // YYYY-MM-DD
  put_end_date?: string;   // YYYY-MM-DD

  // ESO Specific Fields
  num_options?: number;
  strike_price?: number;
  grant_date?: string;
  vesting_start_date?: string;
  vesting_end_date?: string;
  employee_exit_rate?: number; // Annual rate
  early_exercise_multiple?: number; // M * K
}

// Definition for a security within a Deal (excludes global params)
export interface SecurityDef extends Omit<SecuritySchema, "valuation_date" | "share_price_current" | "volatility" | "risk_free_rate" | "credit_spread" | "stepwise_risk_free_rates" | "stepwise_credit_spreads"> {
    id: string; // Unique ID for UI handling
    name: string; // User friendly name e.g. "Series A RCPS"
}

export interface DealSchema {
    deal_name: string;
    valuation_date: string;
    share_price_current: number; // S0
    underlying_num_shares: number; // Common Shares
    volatility: number; // Common Volatility
    
    // Global Market Config
    risk_free_rate: number; // Flat manual
    credit_spread: number; // Flat manual
    
    securities: SecurityDef[];
}

export interface NodeLogRow {
  t: number;
  i: number;
  date: string;
  node_id: string;
  S_ti: number; // Share Price
  D_ti: number; // Debt or Zero
  E_ti: number; // Equity/Option
  V_ti: number; // Total Node Value
  event_flag: string;
  q_up: number;
  rf_t: number;
  cs_t: number;
  conversion_price_eff?: number; // Effective CP at node
}

export interface PricingResult {
  fair_value_total: number; // Total KRW
  fair_value_per_share?: number; // For RCPS/CPS/ESO
  
  fair_value_host: number;
  fair_value_deriv: number;
  fair_value_deriv_asset: number;
  fair_value_deriv_liab: number;
  
  eso_val_per_option?: number;

  tf_debt_component: number; 
  tf_equity_component: number;

  node_logs: NodeLogRow[];
  meta: {
    dt: number;
    u: number;
    d: number;
    N: number;
    valuation_date: string;
    maturity_date: string;
    used_curve_source?: string;
    eff_cp_final?: number;
  };
}

export interface SecurityResult extends PricingResult {
    id: string;
    name: string;
    security_type: SecurityType;
    position: PositionType;
}

export interface DealResult {
    deal_total_value: number;
    deal_price_per_share: number;
    deal_total_host: number;
    deal_total_deriv: number;
    deal_total_asset: number;
    deal_total_liab: number;
    deal_total_deriv_asset: number;
    deal_total_deriv_liab: number;
    
    results: SecurityResult[];
}

export interface YieldPoint {
  tenor_years: number;
  yield: number;
}

export interface MarketData {
  gov_bond_yields: YieldPoint[];
  corp_bond_yields: YieldPoint[];
}

export interface CurvePoint {
  tenor_years: number;
  rate: number;
}

export interface ZeroCurvePoint {
  tenor_years: number;
  zero_rate: number;
  discount_factor: number;
}
