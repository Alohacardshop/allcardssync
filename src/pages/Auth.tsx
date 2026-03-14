import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Palmtree, Loader2, Delete, Lock } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [step, setStep] = useState<"name" | "pin">("name");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (step === "name") {
      nameInputRef.current?.focus();
    }
  }, [step]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setPin("");
    setStep("pin");
  };

  const handlePinDigit = (digit: string) => {
    if (pin.length >= 4 || loading || locked) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      handleLogin(newPin);
    }
  };

  const handlePinDelete = () => {
    if (loading || locked) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleLogin = async (fullPin: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("pin-login", {
        body: { displayName: name.trim(), pin: fullPin },
      });

      if (invokeError) {
        console.error("pin-login invoke error:", invokeError);
        setPin("");
        setError(invokeError.message || "Connection error. Please try again.");
        return;
      }

      if (!data?.ok) {
        setPin("");
        if (data?.locked) {
          setLocked(true);
          setError(data.error);
        } else {
          setError(data?.error || "Invalid name or PIN");
        }
        return;
      }

      if (!data?.tokenHash) {
        console.error("pin-login succeeded but token hash missing", data);
        setPin("");
        setError("Login failed. Please contact your admin.");
        return;
      }

      // Use the magic link token to create a session
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.tokenHash,
        type: "magiclink",
      });

      if (verifyError) {
        console.error("OTP verification failed:", verifyError);
        setPin("");
        setError("Login failed. Please try again.");
        return;
      }

      toast.success(`Welcome back, ${name}!`);
    } catch (err: unknown) {
      console.error("Login error:", err);
      setPin("");
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep("name");
    setPin("");
    setError(null);
    setLocked(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      {/* Decorative Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[hsl(var(--ecosystem-hawaii)/0.1)] rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[hsl(var(--ecosystem-vegas)/0.1)] rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Palmtree className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Aloha Inventory</span>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {step === "name" ? "Welcome" : `Hi, ${name}`}
            </h1>
            <p className="text-muted-foreground">
              {step === "name"
                ? "Enter your name to sign in"
                : "Enter your 4-digit PIN"}
            </p>
          </div>

          <Card className="shadow-lg border-border/50 bg-card/80 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl">
                {step === "name" ? "Sign In" : "Enter PIN"}
              </CardTitle>
              <CardDescription>
                {step === "name"
                  ? "Type your name as set by your admin"
                  : "Use the number pad below"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step === "name" ? (
                <form onSubmit={handleNameSubmit} className="space-y-4">
                  <Input
                    ref={nameInputRef}
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-12 text-lg text-center"
                    autoComplete="off"
                    autoFocus
                  />
                  <Button
                    type="submit"
                    disabled={!name.trim()}
                    className="w-full h-11 font-medium"
                  >
                    Continue
                  </Button>
                </form>
              ) : (
                <div className="space-y-5">
                  {/* PIN dots */}
                  <div className="flex justify-center gap-4">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                          i < pin.length
                            ? "bg-primary border-primary scale-110"
                            : "border-muted-foreground/40"
                        }`}
                      />
                    ))}
                  </div>

                  {loading && (
                    <div className="flex justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 justify-center text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                      {locked && <Lock className="h-4 w-4 shrink-0" />}
                      {error}
                    </div>
                  )}

                  {/* Number pad */}
                  <div className="grid grid-cols-3 gap-3">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <Button
                        key={digit}
                        variant="outline"
                        className="h-14 text-xl font-semibold"
                        onClick={() => handlePinDigit(digit)}
                        disabled={loading || locked || pin.length >= 4}
                      >
                        {digit}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      className="h-14 text-sm text-muted-foreground"
                      onClick={handleBack}
                      disabled={loading}
                    >
                      Back
                    </Button>
                    <Button
                      variant="outline"
                      className="h-14 text-xl font-semibold"
                      onClick={() => handlePinDigit("0")}
                      disabled={loading || locked || pin.length >= 4}
                    >
                      0
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-14"
                      onClick={handlePinDelete}
                      disabled={loading || locked || pin.length === 0}
                    >
                      <Delete className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground px-4">
            Contact your admin if you need an account or forgot your PIN.
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--ecosystem-hawaii))]" />
              <span>Hawaii</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--ecosystem-vegas))]" />
              <span>Las Vegas</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
