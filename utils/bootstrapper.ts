import { CurvePoint, ZeroCurvePoint } from "../types";

/**
 * Bootstraps a zero curve from a par yield curve.
 * Simplified assumption: Input yields are par yields, annual compounding.
 */
export function bootstrapZeroCurve(yieldCurve: CurvePoint[]): ZeroCurvePoint[] {
  // In a full implementation, we would solve for zero rates recursively.
  // For V1 (and often sufficient for simple valuation), we can approximate
  // Zero Rate ≈ Par Yield for flat-ish curves, or use simple discount logic.
  // Here we assume Yield = Zero Rate (Spot Rate) for simplicity in this demo.
  // Real bootstrapping requires a solver for coupon bonds.
  
  return yieldCurve.map(pt => {
    const r = pt.rate;
    // Discount Factor = 1 / (1 + r)^t
    const df = 1 / Math.pow(1 + r, pt.tenor_years);
    return {
        tenor_years: pt.tenor_years,
        zero_rate: r,
        discount_factor: df
    };
  });
}

function getInterpolatedDF(zeroCurve: ZeroCurvePoint[], t: number): number {
    if (t <= 0) return 1.0;
    
    // Extrapolate flat if out of bounds (using first/last rates)
    if (t <= zeroCurve[0].tenor_years) {
        const r = zeroCurve[0].zero_rate;
        return 1 / Math.pow(1 + r, t);
    }
    const last = zeroCurve[zeroCurve.length - 1];
    if (t >= last.tenor_years) {
        const r = last.zero_rate;
        return 1 / Math.pow(1 + r, t);
    }

    // Linear Interpolation on Log DF (equivalent to piecewise constant forward rate)
    // or Linear Interpolation on Zero Rates. Let's do Linear on Zero Rates.
    for (let i = 0; i < zeroCurve.length - 1; i++) {
        if (t >= zeroCurve[i].tenor_years && t <= zeroCurve[i+1].tenor_years) {
            const t0 = zeroCurve[i].tenor_years;
            const r0 = zeroCurve[i].zero_rate;
            const t1 = zeroCurve[i+1].tenor_years;
            const r1 = zeroCurve[i+1].zero_rate;
            
            const r_interp = r0 + ((t - t0) * (r1 - r0)) / (t1 - t0);
            return 1 / Math.pow(1 + r_interp, t);
        }
    }
    return 1.0;
}

/**
 * Generates forward rates for each time step in the lattice.
 * rf_t[t] is the rate applicable from t to t+1.
 */
export function buildStepwiseRates(
    zeroRf: ZeroCurvePoint[], 
    zeroCs: ZeroCurvePoint[], 
    N: number, 
    dt: number
): { rf_t: number[], cs_t: number[] } {
    
    const rf_t: number[] = [];
    const cs_t: number[] = [];

    for (let t = 0; t < N; t++) {
        const T1 = t * dt;
        const T2 = (t + 1) * dt;

        // Risk Free Forward
        const DF1 = getInterpolatedDF(zeroRf, T1);
        const DF2 = getInterpolatedDF(zeroRf, T2);
        
        // Forward Rate f = (DF1 / DF2 - 1) / dt
        // Check for div by zero or tiny dt issues, though dt is fixed.
        const f_rf = (DF1 / DF2 - 1) / dt;
        
        // Credit Spread Forward
        // Using "Credit DF" to extract spread forward
        // Note: zeroCs contains Spreads converted to DFs implies we treat spread as a rate.
        const csDF1 = getInterpolatedDF(zeroCs, T1);
        const csDF2 = getInterpolatedDF(zeroCs, T2);
        const f_cs = (csDF1 / csDF2 - 1) / dt;

        rf_t.push(f_rf);
        cs_t.push(f_cs);
    }

    return { rf_t, cs_t };
}
