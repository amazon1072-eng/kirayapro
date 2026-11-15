import Link from "next/link";
import { AuthForm } from "@/components/forms";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <Link href="/" className="text-2xl font-extrabold text-[#0b2545]">Kiraya<span className="text-teal-600">Pro</span></Link>
        <h1 className="mt-4 text-xl font-bold">Create your organization</h1>
        <p className="mb-5 text-sm text-slate-500">One account, one workspace. Your properties, tenants and bills stay separate from every other organization.</p>
        <AuthForm mode="register" />
        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account? <Link href="/login" className="font-semibold text-teal-700">Log in</Link>
        </p>
      </div>
    </div>
  );
}
