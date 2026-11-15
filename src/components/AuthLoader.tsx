import { useHoldBoot } from "@/lib/bootGate";

// Shown while the sign-in state is checked. On a fresh load it sits under the
// dark boot loader (useHoldBoot keeps that up), so a reload never flashes it.
const AuthLoader = () => {
  useHoldBoot();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading">
      <div className="text-center">
        <p className="font-accent text-[1.4rem] text-gold mb-2">Javani</p>
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    </div>
  );
};

export default AuthLoader;
