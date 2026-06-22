import type { ClinicalCase, SymptomInput } from '../types.js';

export function calculateEuclideanMatch(input: SymptomInput, cases: ClinicalCase[]) {
  const allMatched = cases.map((item) => {
    const dAge = (input.age - item.symptoms.age) / 15.0;
    const dWear = (input.cartilage_wear - item.symptoms.cartilage_wear) * 2.0;
    const dFluid = (input.joint_fluid - item.symptoms.joint_fluid) * 2.0;
    const dPain = (input.pain_score - item.symptoms.pain_score) * 1.5;

    const distance = Math.sqrt(
      dAge ** 2 + dWear ** 2 + dFluid ** 2 + dPain ** 2
    );

    const score = Math.max(0, Math.min(100, Math.round(100 * (1 - distance / 12.0))));

    return {
      case_id: item.case_id,
      case_name: item.case_name,
      distance: parseFloat(distance.toFixed(4)),
      score,
      item,
    };
  });

  allMatched.sort((a, b) => a.distance - b.distance);

  return {
    matchedCase: allMatched[0].item,
    distance: allMatched[0].distance,
    allDistances: allMatched.map((x) => ({
      case_id: x.case_id,
      case_name: x.case_name,
      score: x.score,
      distance: x.distance,
    })),
  };
}
