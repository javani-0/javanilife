import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Eye, EyeOff, KeyRound, Mail, MessageCircle, Phone, UserRound } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import PrimaryButton from "@/components/PrimaryButton";

const sanitizePhone = (value: string) => value.replace(/\D/g, "");

const Signup = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";

  const inputClass =
    "h-10 w-full rounded-2xl border border-gold/25 bg-white px-4 font-body text-[0.9rem] text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.06)] outline-none transition-all placeholder:text-muted-foreground/60 focus:border-gold focus:shadow-[0_0_0_4px_rgba(201,168,76,0.12)] max-[height:760px]:h-9 max-[height:760px]:text-[0.84rem] max-[height:560px]:h-8 max-[height:560px]:text-[0.8rem] sm:h-11 sm:text-[0.92rem]";

  const labelClass =
    "mb-1.5 flex items-center gap-2 font-body text-[0.75rem] font-semibold tracking-[0.1em] text-foreground/80 max-[height:760px]:mb-1 max-[height:760px]:text-[0.68rem] max-[height:560px]:mb-0.5 max-[height:560px]:text-[0.62rem]";

  const handleSendOtp = async () => {
    setError("");
    const digits = sanitizePhone(phone);
    if (digits.length !== 10) {
      setError("Please enter a valid 10-digit WhatsApp number.");
      return;
    }
    setSendingOtp(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send OTP. Please try again.");
        return;
      }
      setOtpSent(true);
      setOtp("");
      setOtpVerified(false);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");
    if (otp.length !== 6) {
      setError("Please enter the 6-digit OTP sent to your WhatsApp.");
      return;
    }
    setVerifyingOtp(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: sanitizePhone(phone), code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "OTP verification failed. Please try again.");
        return;
      }
      setOtpVerified(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("Full name is required.");
      return;
    }
    if (sanitizePhone(phone).length !== 10) {
      setError("Please enter a valid 10-digit WhatsApp number.");
      return;
    }
    if (!otpVerified) {
      setError("Please verify your WhatsApp number with the OTP before creating an account.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: username.trim() });

      const digits = sanitizePhone(phone);
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        username: username.trim(),
        email: email.trim(),
        phone: digits,
        whatsappNumber: digits,
        createdAt: serverTimestamp(),
      });

      navigate(redirectPath.startsWith("/") ? redirectPath : "/", { replace: true });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-in-use") {
        setError("This email is already registered. Please login instead.");
      } else if (code === "auth/weak-password") {
        setError("Password must be at least 6 characters.");
      } else if (code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="ACCOUNT CREATION"
      title="Create Your Account"
      subtitle="Set up your Javani access for product checkout, synced cart, and future order tracking."
      supportTitle="Join the premium Javani member experience"
      supportCopy="Your account should feel like an invitation into the brand, not a generic form. This redesign gives signup the same care as the rest of the journey."
      highlights={[
        "Checkout-ready access for your product orders.",
        "Saved identity for future order tracking.",
        "A premium first impression across every screen size.",
      ]}
      form={
        <>
          {error && (
            <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 font-body text-[0.88rem] text-destructive sm:mb-5 sm:py-3 sm:text-[0.92rem]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-2.5 max-[height:760px]:space-y-2 max-[height:560px]:space-y-1.5 sm:space-y-3">
            {/* Full Name */}
            <label className="block">
              <span className={labelClass}>
                <UserRound className="h-3.5 w-3.5 text-gold" /> FULL NAME
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className={inputClass}
                placeholder="Your full name"
              />
            </label>

            {/* Email */}
            <label className="block">
              <span className={labelClass}>
                <Mail className="h-3.5 w-3.5 text-gold" /> EMAIL ADDRESS
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
                placeholder="you@example.com"
              />
            </label>

            {/* WhatsApp Phone + Send OTP */}
            <div className="block">
              <span className={labelClass}>
                <Phone className="h-3.5 w-3.5 text-gold" /> WHATSAPP NUMBER
              </span>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setOtpSent(false);
                    setOtpVerified(false);
                    setOtp("");
                  }}
                  inputMode="tel"
                  className={`${inputClass} flex-1`}
                  placeholder="10-digit number"
                  maxLength={15}
                  disabled={otpVerified}
                />
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={sendingOtp || otpVerified}
                  className="h-10 shrink-0 rounded-2xl border border-gold/40 bg-gold/10 px-3 font-body text-[0.75rem] font-semibold text-gold transition-colors hover:bg-gold/20 disabled:opacity-50 sm:h-11 sm:px-4 sm:text-[0.78rem]"
                >
                  {sendingOtp ? "Sending…" : otpSent ? "Resend" : "Send OTP"}
                </button>
              </div>
              {otpVerified && (
                <p className="mt-1 flex items-center gap-1 font-body text-[0.75rem] font-semibold text-green-600">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp number verified
                </p>
              )}
            </div>

            {/* OTP Input — shown after OTP is sent, hidden after verified */}
            {otpSent && !otpVerified && (
              <div className="rounded-2xl border border-gold/20 bg-gold/5 p-3 sm:p-4">
                <p className="mb-2 font-body text-[0.78rem] text-muted-foreground">
                  Enter the 6-digit OTP sent to your WhatsApp number.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="h-10 w-full rounded-2xl border border-gold/25 bg-white px-4 text-center font-body text-[1rem] font-bold tracking-[0.3em] text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.06)] outline-none transition-all focus:border-gold focus:shadow-[0_0_0_4px_rgba(201,168,76,0.12)] sm:h-11"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={verifyingOtp || otp.length !== 6}
                    className="h-10 shrink-0 rounded-2xl bg-gold px-4 font-body text-[0.78rem] font-semibold text-white transition-colors hover:bg-gold/90 disabled:opacity-50 sm:h-11 sm:px-5 sm:text-[0.82rem]"
                  >
                    {verifyingOtp ? "Verifying…" : "Verify"}
                  </button>
                </div>
              </div>
            )}

            {/* Password */}
            <label className="block">
              <span className={labelClass}>
                <KeyRound className="h-3.5 w-3.5 text-gold" /> PASSWORD
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={`${inputClass} pr-12`}
                  placeholder="Create a secure password"
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

            <PrimaryButton
              type="submit"
              disabled={loading || !otpVerified}
              className="flex w-full justify-center rounded-[1rem] py-2.5 text-[0.9rem] shadow-[0_18px_38px_rgba(139,26,26,0.2)] max-[height:760px]:py-2 max-[height:760px]:text-[0.84rem] max-[height:560px]:py-1.5 max-[height:560px]:text-[0.8rem] sm:py-3 sm:text-[0.93rem]"
            >
              {loading ? "Creating Account…" : "Create Account"}
            </PrimaryButton>
          </form>
        </>
      }
      footer={
        <p className="text-center font-body text-[0.84rem] text-muted-foreground max-[height:760px]:text-[0.78rem] max-[height:560px]:text-[0.72rem] sm:text-[0.95rem]">
          Already have an account?{" "}
          <Link
            to={redirectPath === "/" ? "/login" : `/login?redirect=${encodeURIComponent(redirectPath)}`}
            className="font-semibold text-gold transition-colors hover:text-gold-dark"
          >
            Sign in here
          </Link>
        </p>
      }
    />
  );
};

export default Signup;
