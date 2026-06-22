/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClinicalCase, SymptomInput } from './types';

/** 5.1 医生临床经验案例库 — 15 组（与 server/db/seed.ts 对齐） */
export const initialClinicalCases: ClinicalCase[] = [
  { case_id: 1, case_name: '临床案例 · 65岁 · 磨损4级 · 积液3级 · 痛8分', symptoms: { age: 65, cartilage_wear: 4, joint_fluid: 3, pain_score: 8 }, treatment: { left_force: 25, right_force: 22, duration: 25, temp: 45, vibration: 2 } },
  { case_id: 2, case_name: '临床案例 · 55岁 · 磨损2级 · 积液1级 · 痛4分', symptoms: { age: 55, cartilage_wear: 2, joint_fluid: 1, pain_score: 4 }, treatment: { left_force: 15, right_force: 15, duration: 20, temp: 42, vibration: 1 } },
  { case_id: 3, case_name: '临床案例 · 72岁 · 磨损5级 · 积液4级 · 痛9分', symptoms: { age: 72, cartilage_wear: 5, joint_fluid: 4, pain_score: 9 }, treatment: { left_force: 30, right_force: 28, duration: 30, temp: 48, vibration: 0 } },
  { case_id: 4, case_name: '临床案例 · 32岁 · 磨损1级 · 积液2级 · 痛5分', symptoms: { age: 32, cartilage_wear: 1, joint_fluid: 2, pain_score: 5 }, treatment: { left_force: 12, right_force: 12, duration: 15, temp: 40, vibration: 1 } },
  { case_id: 5, case_name: '临床案例 · 60岁 · 磨损3级 · 积液2级 · 痛6分', symptoms: { age: 60, cartilage_wear: 3, joint_fluid: 2, pain_score: 6 }, treatment: { left_force: 18, right_force: 18, duration: 20, temp: 43, vibration: 2 } },
  { case_id: 6, case_name: '临床案例 · 68岁 · 磨损4级 · 积液2级 · 痛7分', symptoms: { age: 68, cartilage_wear: 4, joint_fluid: 2, pain_score: 7 }, treatment: { left_force: 22, right_force: 20, duration: 25, temp: 44, vibration: 1 } },
  { case_id: 7, case_name: '临床案例 · 50岁 · 磨损2级 · 积液2级 · 痛5分', symptoms: { age: 50, cartilage_wear: 2, joint_fluid: 2, pain_score: 5 }, treatment: { left_force: 16, right_force: 16, duration: 20, temp: 41, vibration: 2 } },
  { case_id: 8, case_name: '临床案例 · 75岁 · 磨损5级 · 积液5级 · 痛10分', symptoms: { age: 75, cartilage_wear: 5, joint_fluid: 5, pain_score: 10 }, treatment: { left_force: 32, right_force: 30, duration: 30, temp: 46, vibration: 0 } },
  { case_id: 9, case_name: '临床案例 · 28岁 · 磨损1级 · 积液1级 · 痛3分', symptoms: { age: 28, cartilage_wear: 1, joint_fluid: 1, pain_score: 3 }, treatment: { left_force: 10, right_force: 10, duration: 12, temp: 39, vibration: 1 } },
  { case_id: 10, case_name: '临床案例 · 63岁 · 磨损3级 · 积液3级 · 痛7分', symptoms: { age: 63, cartilage_wear: 3, joint_fluid: 3, pain_score: 7 }, treatment: { left_force: 20, right_force: 18, duration: 22, temp: 43, vibration: 2 } },
  { case_id: 11, case_name: '临床案例 · 57岁 · 磨损3级 · 积液1级 · 痛5分', symptoms: { age: 57, cartilage_wear: 3, joint_fluid: 1, pain_score: 5 }, treatment: { left_force: 16, right_force: 15, duration: 20, temp: 42, vibration: 1 } },
  { case_id: 12, case_name: '临床案例 · 70岁 · 磨损4级 · 积液4级 · 痛8分', symptoms: { age: 70, cartilage_wear: 4, joint_fluid: 4, pain_score: 8 }, treatment: { left_force: 26, right_force: 25, duration: 25, temp: 45, vibration: 0 } },
  { case_id: 13, case_name: '临床案例 · 35岁 · 磨损2级 · 积液2级 · 痛6分', symptoms: { age: 35, cartilage_wear: 2, joint_fluid: 2, pain_score: 6 }, treatment: { left_force: 14, right_force: 14, duration: 15, temp: 41, vibration: 1 } },
  { case_id: 14, case_name: '临床案例 · 66岁 · 磨损4级 · 积液3级 · 痛9分', symptoms: { age: 66, cartilage_wear: 4, joint_fluid: 3, pain_score: 9 }, treatment: { left_force: 28, right_force: 26, duration: 25, temp: 46, vibration: 2 } },
  { case_id: 15, case_name: '临床案例 · 52岁 · 磨损1级 · 积液1级 · 痛4分', symptoms: { age: 52, cartilage_wear: 1, joint_fluid: 1, pain_score: 4 }, treatment: { left_force: 12, right_force: 12, duration: 15, temp: 40, vibration: 1 } },
];

/**
 * 欧氏距离智能算法 (Euclidean Distance AI Match)
 */
export function calculateEuclideanMatch(input: SymptomInput, cases: ClinicalCase[]): {
  matchedCase: ClinicalCase;
  distance: number;
  allDistances: { case_id: number; case_name: string; score: number; distance: number }[];
} {
  const allMatched = cases.map((item) => {
    const dAge = (input.age - item.symptoms.age) / 15.0;
    const dWear = (input.cartilage_wear - item.symptoms.cartilage_wear) * 2.0;
    const dFluid = (input.joint_fluid - item.symptoms.joint_fluid) * 2.0;
    const dPain = (input.pain_score - item.symptoms.pain_score) * 1.5;

    const distance = Math.sqrt(
      Math.pow(dAge, 2) +
      Math.pow(dWear, 2) +
      Math.pow(dFluid, 2) +
      Math.pow(dPain, 2)
    );

    const score = Math.max(0, Math.min(100, Math.round(100 * (1 - distance / 12.0))));

    return {
      case_id: item.case_id,
      case_name: item.case_name,
      distance: parseFloat(distance.toFixed(4)),
      score: score,
      item: item,
    };
  });

  allMatched.sort((a, b) => a.distance - b.distance);

  return {
    matchedCase: allMatched[0].item,
    distance: allMatched[0].distance,
    allDistances: allMatched.map(x => ({
      case_id: x.case_id,
      case_name: x.case_name,
      score: x.score,
      distance: x.distance
    }))
  };
}
