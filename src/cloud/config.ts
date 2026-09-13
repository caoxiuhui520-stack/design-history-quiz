/**
 * 云服务公开配置。
 *
 * 这三个值来自 workbuddy_cloud_service 开通时返回的 publicConfig，是**唯一**允许写进前端代码的
 * 凭据：publishableKey 只标识「是哪个应用」，本身不带任何权限，服务端会做 Origin 精确校验。
 * 底层环境 id 与供应商密钥都留在服务端，永远不会返回给前端。
 *
 * 注意：服务端只接受**已登记的发布域名**的 Origin，因此登录/同步/排行榜只在发布版可用；
 * GitHub Pages 版本会走降级路径（本地模式），不做任何伪装。
 */

export const CLOUD_ENDPOINT = 'https://design-history-quiz.app.workbuddy.host';
export const CLOUD_PUBLISHABLE_KEY =
  'wbpk_9X3KgaRcQgixFDDByZ7Mfp_YnDcKRIARtK8vhv1T0IVxKhk7XSvYsrl';
export const CLOUD_RESOURCE_ID = 'wbcs_8u1Dzlke90eYARZLYyijIw';

/** 应用 id 同时用于云端与发布，发布时必须复用它以保住已登记的域名与 Origin。 */
export const APPLICATION_ID = 'wbapp_9X3KgaRcQgixFDDByZ7Mfp';

/** 已登记的发布域名（Origin 必须完全一致）。 */
export const RELEASE_ORIGIN = CLOUD_ENDPOINT;

/**
 * 当前是否运行在已登记的发布域名上。
 * 登录需要 HTTPS + 精确 Origin，localhost / 预览 / GitHub Pages 均不满足。
 */
export function isReleaseOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.origin === RELEASE_ORIGIN;
}

/** 在非发布域名上关闭云端入口，避免用户点了却拿到看不懂的报错。 */
export const CLOUD_FEATURES_ENABLED = typeof window !== 'undefined' && isReleaseOrigin();
