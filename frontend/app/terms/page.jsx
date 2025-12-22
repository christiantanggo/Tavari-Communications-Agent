import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service - Tavari',
  description: 'Tavari Terms of Service - Terms and conditions for using our platform',
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms of Service</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-4">
              <strong>Last Updated:</strong> December 22, 2025
            </p>
            
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-600 mb-4">
                By accessing and using Tavari ("we," "our," or "us"), you accept and agree to be bound by the terms 
                and provision of this agreement. If you do not agree to these Terms of Service, please do not use our Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-600 mb-4">
                Tavari provides an AI-powered phone answering service and SMS campaign platform that enables businesses to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Answer phone calls automatically using AI assistants</li>
                <li>Send and receive SMS/MMS messages</li>
                <li>Manage customer contacts and lists</li>
                <li>Create and send SMS campaigns</li>
                <li>Track call and message analytics</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Account Registration</h2>
              <p className="text-gray-600 mb-4">
                To use our Service, you must:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Provide accurate, current, and complete information during registration</li>
                <li>Maintain and update your account information to keep it accurate</li>
                <li>Maintain the security of your account credentials</li>
                <li>Accept responsibility for all activities under your account</li>
                <li>Be at least 18 years old or have parental consent</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. SMS and Messaging Compliance</h2>
              
              <h3 className="text-xl font-semibold text-gray-800 mb-3">4.1 TCPA Compliance</h3>
              <p className="text-gray-600 mb-4">
                When using our SMS campaign features, you agree to comply with the Telephone Consumer Protection Act (TCPA) 
                and all applicable regulations:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>You must obtain explicit written consent before sending marketing SMS messages</li>
                <li>You must clearly identify your business in all messages</li>
                <li>You must provide clear opt-out instructions (STOP keyword)</li>
                <li>You must honor opt-out requests immediately</li>
                <li>You must not send messages to numbers on the National Do Not Call Registry (unless you have prior express written consent)</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">4.2 Opt-In Requirements</h3>
              <p className="text-gray-600 mb-4">
                You agree to only send SMS messages to contacts who have:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Explicitly opted-in to receive messages from your business</li>
                <li>Provided clear consent through a documented method (website form, in-person sign-up, keyword text, etc.)</li>
                <li>Been informed that message and data rates may apply</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mb-3">4.3 Prohibited Content</h3>
              <p className="text-gray-600 mb-4">
                You agree not to send messages containing:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Spam, phishing, or fraudulent content</li>
                <li>Illegal or harmful content</li>
                <li>Content that violates third-party rights</li>
                <li>Unsolicited messages to contacts who have not opted in</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Acceptable Use</h2>
              <p className="text-gray-600 mb-4">
                You agree not to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Use the Service for any illegal purpose or in violation of any laws</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Attempt to gain unauthorized access to any part of the Service</li>
                <li>Use automated systems to access the Service without permission</li>
                <li>Transmit viruses, malware, or other harmful code</li>
                <li>Impersonate any person or entity</li>
                <li>Violate any third-party rights (intellectual property, privacy, etc.)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Payment and Billing</h2>
              <p className="text-gray-600 mb-4">
                <strong>Subscription Plans:</strong> Our Service is offered on a subscription basis. You agree to pay all 
                fees associated with your selected plan.
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Fees are billed in advance on a monthly or annual basis</li>
                <li>All fees are non-refundable except as required by law</li>
                <li>We reserve the right to change our pricing with 30 days' notice</li>
                <li>Failure to pay may result in suspension or termination of your account</li>
              </ul>
              <p className="text-gray-600">
                <strong>Usage-Based Charges:</strong> Additional charges may apply for usage exceeding your plan limits 
                (e.g., additional call minutes, SMS messages, or storage).
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Intellectual Property</h2>
              <p className="text-gray-600 mb-4">
                The Service and its original content, features, and functionality are owned by Tavari and are protected by 
                international copyright, trademark, patent, trade secret, and other intellectual property laws.
              </p>
              <p className="text-gray-600">
                You retain ownership of your content (call recordings, messages, contact lists, etc.). By using the Service, 
                you grant us a license to use, store, and process your content solely for the purpose of providing the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Data and Privacy</h2>
              <p className="text-gray-600 mb-4">
                Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy to understand 
                how we collect, use, and protect your information.
              </p>
              <p className="text-gray-600">
                You are responsible for ensuring that any data you upload or process through the Service complies with applicable 
                privacy laws and that you have obtained necessary consents from data subjects.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Service Availability</h2>
              <p className="text-gray-600 mb-4">
                We strive to provide reliable service but do not guarantee:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Uninterrupted or error-free operation</li>
                <li>That the Service will meet your specific requirements</li>
                <li>That defects will be corrected</li>
              </ul>
              <p className="text-gray-600 mt-4">
                We reserve the right to modify, suspend, or discontinue the Service at any time with or without notice.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Limitation of Liability</h2>
              <p className="text-gray-600 mb-4">
                To the maximum extent permitted by law, Tavari shall not be liable for any indirect, incidental, special, 
                consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, 
                or any loss of data, use, goodwill, or other intangible losses.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Indemnification</h2>
              <p className="text-gray-600">
                You agree to indemnify and hold harmless Tavari, its officers, directors, employees, and agents from any 
                claims, damages, losses, liabilities, and expenses (including legal fees) arising out of or relating to your 
                use of the Service, violation of these Terms, or violation of any rights of another party.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Termination</h2>
              <p className="text-gray-600 mb-4">
                We may terminate or suspend your account immediately, without prior notice, for conduct that we believe violates 
                these Terms or is harmful to other users, us, or third parties.
              </p>
              <p className="text-gray-600">
                You may terminate your account at any time by contacting support. Upon termination, your right to use the Service 
                will cease immediately, and we may delete your account and data in accordance with our data retention policies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Changes to Terms</h2>
              <p className="text-gray-600">
                We reserve the right to modify these Terms at any time. We will notify you of any material changes by posting 
                the new Terms on this page and updating the "Last Updated" date. Your continued use of the Service after such 
                changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Governing Law</h2>
              <p className="text-gray-600">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Tavari 
                operates, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. Contact Information</h2>
              <p className="text-gray-600 mb-2">
                If you have questions about these Terms of Service, please contact us:
              </p>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-700">
                  <strong>Email:</strong>{' '}
                  <a href="mailto:legal@tavarios.com" className="text-blue-600 hover:underline">
                    legal@tavarios.com
                  </a>
                </p>
                <p className="text-gray-700 mt-2">
                  <strong>Support:</strong>{' '}
                  <a href="mailto:support@tavarios.com" className="text-blue-600 hover:underline">
                    support@tavarios.com
                  </a>
                </p>
              </div>
            </section>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="space-x-4">
                <Link href="/privacy" className="text-blue-600 hover:underline text-sm">
                  Privacy Policy
                </Link>
                <Link href="/opt-in-workflow" className="text-blue-600 hover:underline text-sm">
                  SMS Opt-In Workflow
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

