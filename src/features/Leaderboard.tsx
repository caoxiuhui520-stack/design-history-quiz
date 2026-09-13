/**
 * 账号与排行榜同属「云端」模块，实现都在 ./Account.tsx（共用登录态与错误处理）。
 * 这里只做转发，避免出现两份实现。
 */
export { Account, Leaderboard } from './Account';
