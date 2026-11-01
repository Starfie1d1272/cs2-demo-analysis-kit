import {
  computeFrozenProBaselineRR, computeRRSixAccounts, rrSixAccountProBaselineV0, rrSixAccountWeightsV1,
  computeRR, computePrism, hltv2BaselineWeightsV1, prismWeightsV1, rrToPercentile,
  type ProBaselineConfig, type RRSixAccountWeights, type RRSignals, type RRIndicators,
  type RRWeights, type PrismWeights, type PrismComputeInput, type RRResult
} from "@rivalhub/rival-rating";
import type { AccountRatingResult, IndicatorRatingResult } from "./models.js";

export * from "./models.js";
export {
  computeFrozenProBaselineRR, computePrism, computeRR, rrToPercentile,
  prismWeightsV1, rrSixAccountProBaselineV0, hltv2BaselineWeightsV1, rrSixAccountWeightsV1,
  PRISM_AXIS_ORDER, RR_ACCOUNTS, computeCohortAccountsRR,
  type RRAccountKey,
  type ProBaselineConfig, type PrismComputeInput, type PrismWeights, type RRWeights, type PrismAxisKey
} from "@rivalhub/rival-rating";

export function computeAccountRatings(signals: RRSignals[]): Array<{ signals: RRSignals; rr: AccountRatingResult }> {
  const weights = rrSixAccountWeightsV1 as unknown as RRSixAccountWeights;
  const baseline = rrSixAccountProBaselineV0 as unknown as ProBaselineConfig;
  const rawBySteamId = new Map(signals.map((row) => [row.steamId64, computeRRSixAccounts(row, weights)]));
  const balanced = signals.map((signal) => computeFrozenProBaselineRR(signal, weights, baseline));

  return balanced.map((rr, index) => {
    const signal = signals[index]!;
    const raw = rawBySteamId.get(signal.steamId64);
    return {
      signals: signal,
      rr: {
        ...rr,
        combatContextFactor: raw?.combatContextFactor ?? 1,
        weightsVersion: raw?.weightsVersion ?? weights.version,
        model: raw?.model ?? "rr-six-accounts"
      }
    };
  });
}

export function computeIndicatorRatings(indicators: RRIndicators[]): IndicatorRatingResult[] {
  const rrWeights = hltv2BaselineWeightsV1 as unknown as RRWeights;
  const prismWeights = prismWeightsV1 as unknown as PrismWeights;
  const rrResults = indicators.map((indicator) => computeRR(indicator, rrWeights));
  const rrScores = rrResults.map((result) => result.rr);
  const prismInputs: PrismComputeInput[] = indicators.map((indicator, index) => ({
    indicators: indicator,
    mapCount: 1,
    rrPercentile: round(rrToPercentile(rrScores, rrResults[index]?.rr ?? 1), 1)
  }));
  const prismResults = computePrism(prismInputs, prismWeights);

  return indicators.map((indicator, index) => {
    return {
      steamId64: indicator.steamId64,
      indicators: indicator,
      rr: rrResults[index] ?? zeroRR(rrWeights.version),
      rrPercentile: prismInputs[index]?.rrPercentile ?? 50,
      prism: prismResults.find((result) => result.steamId64 === indicator.steamId64) ?? null
    };
  });
}

function zeroRR(version: string): RRResult {
  return {
    rr: 1,
    rrBase: 1,
    rrSwing: 0,
    weightsVersion: version,
    breakdown: {
      kastTerm: 0,
      kprTerm: 0,
      dprTerm: 0,
      impactTerm: 0,
      adrTerm: 0,
      intercept: 0
    }
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
