import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import PrimaryButton from "@/components/PrimaryButton";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Partners land on their read-only dashboard; everyone else honours the
      // redirect param (defaulting to home).
      let destination = redirectPath.startsWith("/") ? redirectPath : "/";
      if (destination === "/") {
        try {
          const profile = await getDoc(doc(db, "users", cred.user.uid));
          if (profile.exists() && profile.data().role === "partner") destination = "/partner";
        } catch { /* fall back to the default destination */ }
      }
      navigate(destination, { replace: true });
    } catch (err: any) {
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (err.code === "auth/wrong-password") {
        setError("Incorrect password.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try later.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="MEMBER SIGN IN"
      title="Welcome Back"
      subtitle="Enter your details to continue with orders, cart sync, and your premium Javani experience."
      supportTitle="Access your curated spiritual journey"
      supportCopy="From product checkout to course discovery, every account touchpoint should feel as refined as the brand itself."
      highlights={[
        "Secure access for checkout and order history.",
        "Your cart stays connected across sessions.",
        "Designed to feel premium on mobile and desktop.",
      ]}
      form={
        <>
          {error && (
            <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 font-body text-[0.88rem] text-destructive sm:mb-5 sm:py-3 sm:text-[0.92rem]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-2.5 max-[height:760px]:space-y-2 max-[height:560px]:space-y-1.5 sm:space-y-3">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 font-body text-[0.75rem] font-semibold tracking-[0.1em] text-foreground/80 max-[height:760px]:mb-1 max-[height:760px]:text-[0.68rem] max-[height:560px]:mb-0.5 max-[height:560px]:text-[0.62rem]">
                <Mail className="h-3.5 w-3.5 text-gold" /> EMAIL ADDRESS
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 w-full rounded-2xl border border-gold/25 bg-white px-4 font-body text-[0.9rem] text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.06)] outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:shadow-[0_0_0_4px_rgba(201,168,76,0.12)] max-[height:760px]:h-9 max-[height:760px]:text-[0.84rem] max-[height:560px]:h-8 max-[height:560px]:text-[0.8rem] sm:h-11 sm:text-[0.92rem]"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 font-body text-[0.75rem] font-semibold tracking-[0.1em] text-foreground/80 max-[height:760px]:mb-1 max-[height:760px]:text-[0.68rem] max-[height:560px]:mb-0.5 max-[height:560px]:text-[0.62rem]">
                <KeyRound className="h-3.5 w-3.5 text-gold" /> PASSWORD
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 w-full rounded-2xl border border-gold/25 bg-white px-4 pr-12 font-body text-[0.9rem] text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.06)] outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:shadow-[0_0_0_4px_rgba(201,168,76,0.12)] max-[height:760px]:h-9 max-[height:760px]:text-[0.84rem] max-[height:560px]:h-8 max-[height:560px]:text-[0.8rem] sm:h-11 sm:text-[0.92rem]"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-gold/10 hover:text-gold"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>

            <PrimaryButton type="submit" disabled={loading} className="flex w-full justify-center rounded-[1rem] py-2.5 text-[0.9rem] shadow-[0_18px_38px_rgba(139,26,26,0.2)] max-[height:760px]:py-2 max-[height:760px]:text-[0.84rem] max-[height:560px]:py-1.5 max-[height:560px]:text-[0.8rem] sm:py-3 sm:text-[0.93rem]">
              {loading ? "Signing In..." : "Sign In"}
            </PrimaryButton>
          </form>
        </>
      }
      footer={
        <p className="text-center font-body text-[0.84rem] text-muted-foreground max-[height:760px]:text-[0.78rem] max-[height:560px]:text-[0.72rem] sm:text-[0.95rem]">
          Don&apos;t have an account?{" "}
          <Link to={redirectPath === "/" ? "/signup" : `/signup?redirect=${encodeURIComponent(redirectPath)}`} className="font-semibold text-gold transition-colors hover:text-gold-dark">
            Create one now
          </Link>
        </p>
      }
    />
  );
};

export default Login;
