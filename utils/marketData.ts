import { MarketData, YieldPoint, CurvePoint } from "../types";

/**
 * Mocks fetching market data from Seibro / KOFIA Bond.
 * In a real app, this would be an API call to a backend proxy.
 */
export async function fetchMarketData(
  as_of_date: string,
  credit_rating: string
): Promise<MarketData> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Realistic mock data generation based on rating
  // Base Government Curve (Approximate to current KRW market)
  const baseGov: YieldPoint[] = [
    { tenor_years: 0.25, yield: 0.0330 },
    { tenor_years: 0.5, yield: 0.0335 },
    { tenor_years: 1.0, yield: 0.0340 },
    { tenor_years: 2.0, yield: 0.0345 },
    { tenor_years: 3.0, yield: 0.0350 },
    { tenor_years: 5.0, yield: 0.0355 },
    { tenor_years: 10.0, yield: 0.0360 },
  ];

  // Credit Spread Multiplier based on Rating (Simplified)
  let spreadBase = 0.0050; // AAA
  if (credit_rating.includes("AA")) spreadBase = 0.0120;
  else if (credit_rating.includes("A")) spreadBase = 0.0250;
  else if (credit_rating.includes("BBB")) spreadBase = 0.0500;
  else if (credit_rating.includes("BB")) spreadBase = 0.0800;

  // Generate Corp Curve
  const corpBond: YieldPoint[] = baseGov.map((pt) => ({
    tenor_years: pt.tenor_years,
    yield: pt.yield + spreadBase + (pt.tenor_years * 0.001), // Slight steepening
  }));

  return {
    gov_bond_yields: baseGov,
    corp_bond_yields: corpBond,
  };
}

/**
 * Linear interpolation helper
 */
function interpolate(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

function getInterpolatedYield(curve: YieldPoint[], targetTenor: number): number {
  // Extrapolate flat if out of bounds
  if (targetTenor <= curve[0].tenor_years) return curve[0].yield;
  if (targetTenor >= curve[curve.length - 1].tenor_years) return curve[curve.length - 1].yield;

  // Find surrounding points
  for (let i = 0; i < curve.length - 1; i++) {
    if (targetTenor >= curve[i].tenor_years && targetTenor <= curve[i+1].tenor_years) {
        return interpolate(targetTenor, curve[i].tenor_years, curve[i].yield, curve[i+1].tenor_years, curve[i+1].yield);
    }
  }
  return curve[0].yield;
}

/**
 * Builds standardized curves for Risk-Free and Credit Spread
 */
export function buildCurves(marketData: MarketData): {
  rf_curve: CurvePoint[];
  cs_curve: CurvePoint[];
} {
  const tenors = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 7, 10]; // Standard Grid
  
  const rf_curve: CurvePoint[] = [];
  const cs_curve: CurvePoint[] = [];

  tenors.forEach(t => {
      const rf_y = getInterpolatedYield(marketData.gov_bond_yields, t);
      const corp_y = getInterpolatedYield(marketData.corp_bond_yields, t);
      
      rf_curve.push({ tenor_years: t, rate: rf_y });
      cs_curve.push({ tenor_years: t, rate: corp_y - rf_y }); // Spread = Corp - Gov
  });

  return { rf_curve, cs_curve };
}
