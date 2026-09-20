import { type RefObject, useLayoutEffect } from 'react';

/**
 * Replays a CSS keyframe animation on an element that STAYS MOUNTED.
 *
 * The obvious way to restart an animation is `key={something}`, and it is a
 * trap: a changed key throws the element away and mounts a new one, so every
 * piece of state below it is destroyed. That cost the app shell a chart range
 * and a carousel position on every route change (SHELL-6), and it cost the auth
 * shell the whole email→verify step — the login form rewound to "enter your
 * email" mid-navigation while the code the user had just typed was still being
 * exchanged (LOGIN-7). Nothing about replaying an animation requires destroying
 * the subtree being animated.
 *
 * `replayKey` is a signal, not a value: the body never reads it, it only decides
 * WHEN to replay. Pick it deliberately — a key that moves while a navigation is
 * still pending replays the animation on the outgoing screen.
 *
 * Layout effect, not a passive one: `useEffect` runs after the browser paints,
 * so the first frame would show the element at its resting position and snap
 * back to keyframe 0 on the next frame. `useLayoutEffect` runs inside the same
 * commit, so the first frame the user sees is already frame 0. No
 * isomorphic-layout-effect guard, matching every other layout effect here:
 * nothing in this app renders on the server (`main.tsx` is a client
 * `createRoot`) and the unit suite runs in jsdom.
 */
export function useReplayedAnimation(
  ref: RefObject<HTMLElement | null>,
  animationClass: string,
  replayKey: string,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: replayKey is the replay signal, not a value the body reads — dropping it would leave the animation stuck on its first play
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove(animationClass);
    // Reading layout forces a reflow. Without it the browser coalesces the
    // remove + add into no change at all and the animation never replays.
    el.getBoundingClientRect();
    el.classList.add(animationClass);
  }, [ref, animationClass, replayKey]);
}
