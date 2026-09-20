// The ROOT route mounts this barrel, so anything it touches lands in the entry
// chunk. Export only the lazy shell — `ConsentBanner.tsx` itself is imported
// directly by its own tests and loaded on demand by the shell.
export { ConsentBannerLazy } from './ConsentBannerLazy.tsx';
