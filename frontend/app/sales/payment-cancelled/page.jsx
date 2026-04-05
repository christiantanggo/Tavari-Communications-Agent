import Link from 'next/link';

export default function SalesPaymentCancelledPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-xl shadow border border-slate-200 p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Checkout cancelled</h1>
        <p className="mt-4 text-slate-600 text-sm">
          You closed the payment page before completing checkout. Your sales representative can send you the link again,
          or you can sign in and continue from billing when you&apos;re ready.
        </p>
        <div className="mt-6 flex flex-col gap-2 text-sm">
          <Link href="/login" className="text-teal-700 font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
