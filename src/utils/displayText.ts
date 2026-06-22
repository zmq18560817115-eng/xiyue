/** 移除通知/标题中常见的 emoji 前缀，便于统一简笔画风格展示 */
export function stripEmojiPrefix(text: string): string {
  return text
    .replace(
      /^(📋|👩‍🦰|👩‍⚕️|👨‍⚕️|🔔|⚠️|⚙️|🎉|💡|📞|🏥|🚪|✓|⚡|⏱️|🚨)\s*/u,
      ''
    )
    .trim();
}
