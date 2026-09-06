# 05: Typed DrawioBridge host-guest

**What to build:** The implicit `postMessage {type:string, payload:any}` contract between Siyuan host and draw.io guest becomes a typed deep module `DrawioBridge` that owns language mapping and `urlParams` setup.

**Blocked by:** 01: Establish domain seam — CONTEXT.md + AssetStore expand

**Status:** ready-for-agent

- [ ] New module `src/bridge/DrawioBridge.ts` (and `client/BridgeGuest.ts`) defines typed `BridgeMessage` union (`NEW_TYPE`/`OPEN_TYPE`/`UPDATE_TITLE`/`COPY_LINK`/`OPEN_TAB_BY_PATH`) with validation and error modes as part of the interface
- [ ] `getLang()` BCP-47 fix (`zh-CN`/`zh_CN` → `zh`) and `window.DRAWIO_*` / `urlParams` mutations live only inside Bridge adapters: `SiyuanBridgeHost` (in `src/index.ts` side) and `DrawioBridgeGuest` (client `PreConfig`/`PostConfig` side); duplicates in `client/PreConfig.js` and `src/link.ts` removed
- [ ] Unit test exercises `Bridge` through its interface with `FakeBridge` (no iframe/CDP), covering lang mapping table and origin check
- [ ] Demo: switch SiYuan language to `zh-CN` → guest iframe `urlParams.lang` is `zh` (not `zh-cn`); `pnpm e2e` language tests green; no duplication across host/guest
