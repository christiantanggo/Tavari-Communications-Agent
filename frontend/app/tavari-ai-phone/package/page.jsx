import { redirect } from 'next/navigation';

export default function TavariAiPhonePackageRedirect() {
  redirect('/admin/packages?module_key=phone-agent');
}
