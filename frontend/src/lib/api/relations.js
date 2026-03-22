import { api } from './client.js';

/** 依存関係ルール一覧（SCHEMA#RELATIONS から取得） */
export function getRelationRules() {
  return api('GET', '/admin/relation-rules');
}

/** 手動クレンジング実行。dryRun=true の場合はオーファン件数のみ返す */
export function runCleanse(dryRun = true) {
  return api('POST', '/admin/cleanse', { dryRun });
}

/**
 * 既存レコードに未設定フィールドのデフォルト値を一括設定する。
 * @param {string} ruleId  - RELATION_RULES の id
 * @param {string} defaultValue - 親マスタのID値
 * @returns {{ updatedCount: number }}
 */
export function runBackfill(ruleId, defaultValue) {
  return api('POST', '/admin/backfill', { ruleId, defaultValue });
}
