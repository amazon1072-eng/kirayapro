import Link from "next/link";
import { AuthForm } from "@/components/forms";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <Link href="/" className="text-2xl font-extrabold text-[#0b2545]">Kiraya<span className="text-teal-600">Pro</span></Link>
        <h1 className="mt-4 text-xl font-bold">Log in</h1>
        <p className="mb-5 text-sm text-slate-500">Sign in to your organization workspace.</p>
        <AuthForm mode="login" />
        <p className="mt-4 text-center text-sm text-slate-500">
          No account yet? <Link href="/register" className="font-semibold text-teal-700">Create your organization</Link>
        </p>
      </div>
    </div>
  );
}
