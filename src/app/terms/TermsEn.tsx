import Link from 'next/link'

import type { LegalDocProps } from './types'

/**
 * English terms of use — a translation of TermsHe, kept as a sibling component
 * rather than catalog strings because the prose carries inline markup, links and
 * tables. The Hebrew version remains the counsel-reviewed original.
 */
export function TermsEn({ email, addr, tel, reg }: LegalDocProps) {
  return (
      <div className="mt-8 space-y-10 text-sm leading-relaxed text-muted-foreground" dir="ltr">

        {/* 1 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">1. Introduction and identity of the parties</h2>
          <p>
            These terms of use (&quot;the Terms&quot;) govern the relationship between{' '}
            <strong className="text-foreground">Turgeman Guetta Hadar Mazal</strong>, exempt dealer number{' '}
            <strong className="text-foreground">{reg}</strong>, address:{' '}
            <strong className="text-foreground">{addr}</strong> (&quot;the Company&quot;, &quot;Lessio&quot;),
            and anyone using the Lessio platform (&quot;the Customer&quot;, &quot;the User&quot;).
          </p>
          <p className="mt-3">
            Using the Lessio platform — including registering an account, accessing the system, using
            features, taking part in a pilot, opening a trial account, entering the parent portal, or
            using any part of the service — constitutes full and binding acceptance of these Terms and
            of the Lessio privacy policy.
          </p>
          <p className="mt-3">
            Support enquiries: <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
            {' · '}
            Legal enquiries: <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">2. Definitions</h2>
          <dl className="space-y-2">
            {[
              ['Lessio / the system', 'The software-as-a-service (SaaS) platform operated by the Company, including all user interfaces, the API, the parent portal, accompanying applications, databases and related services.'],
              ['The Company / the service operator', 'Turgeman Guetta Hadar Mazal, exempt dealer number 204174361, who operates Lessio and provides the service.'],
              ['Business customer', 'A business, educational institution, learning centre, private tutor, company, non-profit or any other legal entity or individual purchasing access to Lessio in order to run an independent business.'],
              ['Authorised user', 'A teacher, employee, manager, partner or any other person the business customer has authorised to access the system on its behalf.'],
              ['End user', 'A parent, student, teacher, employee or customer of the business customer who uses the publicly reachable parts of the system (such as the parent portal) without being a direct party to an agreement with the Company.'],
              ['Customer content', 'Any information, data, text, images, files, contact details, messages and other content the business customer enters into the system, uploads to it, or creates through it.'],
              ['Third-party providers', 'External service providers the system may rely on, including but not limited to: WhatsApp/Meta, card-payment processors, invoicing providers, cloud providers, email and SMS services, and analytics tools.'],
              ['The service / the services', 'All functionality, tools, interfaces and capabilities offered through Lessio, as they may be from time to time.'],
            ].map(([term, def]) => (
              <div key={term} className="flex gap-2">
                <dt className="font-medium text-foreground shrink-0">&quot;{term}&quot;</dt>
                <dd>— {def}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">3. Acceptance of the Terms</h2>
          <p className="mb-2">Doing any of the following constitutes binding acceptance of these Terms:</p>
          <ul className="list-disc list-inside space-y-1 ms-3">
            {['Registering and creating an account', 'Signing in to the system', 'Using any part of the service, including during a pilot or trial period', 'Clicking "I agree", "Join", "Continue" or a similar confirmation during sign-up', 'Using the parent portal'].map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3">
            A person using the system on behalf of a business, company, non-profit or any other legal
            entity represents that they are authorised to bind that entity and accepts the Terms on its
            behalf as well. Anyone who does not agree to the Terms must not use the service.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">4. Description of the service</h2>
          <p>
            Lessio provides operational infrastructure for running businesses in private tutoring and
            learning centres. The system may include, from time to time, capabilities for managing:
            students, parents, teachers, lessons, calendars, availability, cancellations, attendance,
            WhatsApp messages and reminders, charges, payment requests, payment statuses, connections to
            payment and invoicing providers, a parent portal, reports and management views.
          </p>
          <p className="mt-3">
            Lessio is an operational system that supports running these processes. It is{' '}
            <strong className="text-foreground">not</strong> a payment processor, a bank, a credit card
            company, a bookkeeping service or a tax adviser, and it does not issue tax invoices on the
            customer&apos;s behalf unless expressly agreed otherwise.
          </p>
          <p className="mt-3">
            The features, capabilities, interfaces and third-party services available within Lessio may
            change, be added, limited, removed or updated from time to time, subject to reasonable notice
            in the case of a material change.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">5. Pilot, beta and free use</h2>
          <p>
            Lessio offers a trial period of{' '}
            <strong className="text-foreground">30 days at no charge and with no credit card required</strong>.
            At the end of that period, moving to a paid plan requires express consent.
          </p>
          <p className="mt-3">
            Free use is provided <strong className="text-foreground">&quot;as is&quot;</strong>, without
            any undertaking as to availability, stability, continuity, data integrity, performance, full
            support or fitness for any particular need.
          </p>
          <p className="mt-3">
            The Company reserves the right to discontinue, limit, change or upgrade free use at any time,
            with reasonable advance notice where possible. Free use does not create a right to continued
            free use and does not prevent the Company from requiring a move to a paid plan at any time.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">6. User accounts and permissions</h2>
          <ul className="list-disc list-inside space-y-2 ms-3">
            <li>The business customer is responsible for keeping its account credentials confidential.</li>
            <li>The customer is responsible for every action taken through its account — whether by the customer or by authorised users it has added.</li>
            <li>The customer is responsible for setting appropriate permissions for teachers, employees and authorised users. The Company is not responsible for unauthorised access resulting from the customer&apos;s own configuration.</li>
            <li>
              The customer undertakes to notify the Company immediately at{' '}
              <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
              {' '}in any case of suspected unauthorised use of its account.
            </li>
          </ul>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">7. Business customer responsibilities</h2>
          <div className="space-y-3">
            <p><strong className="text-foreground">Accuracy of information:</strong> the customer is responsible for the correctness, accuracy and currency of all information it enters into the system.</p>
            <p><strong className="text-foreground">Consents and authorisations:</strong> the customer represents that it has obtained every consent, permission and approval required by law in order to enter personal information about students, parents, teachers and employees, and to send messages and payment requests.</p>
            <p><strong className="text-foreground">Legal compliance:</strong> the customer is responsible for complying with every law that applies to it — the Protection of Privacy Law, the Communications Law (commercial messages), the Consumer Protection Law, bookkeeping rules, tax law and any relevant sector-specific requirement.</p>
            <p><strong className="text-foreground">Message content:</strong> the customer is responsible for all content it sends to its own customers through the system. Lessio is a delivery channel only.</p>
            <p><strong className="text-foreground">Welcome notice and opt-out:</strong> before the first business-initiated message is sent to a parent, the system sends a one-time welcome notice stating on whose behalf the messages are sent, what kinds of messages will follow, and how to stop them (by replying &quot;stop&quot; or &quot;הסר&quot;). A parent who asks to stop receives no further business-initiated messages of any kind. None of this reduces the customer&apos;s responsibility to obtain the consents required by law.</p>
            <p><strong className="text-foreground">Customer relationships:</strong> the customer is responsible for its rates, cancellation terms, refunds, collection, payment policy and any dispute between it and its own customers.</p>
            <p><strong className="text-foreground">Professional advice:</strong> operating Lessio does not constitute legal, accounting, commercial or tax advice, and does not replace such professional advice.</p>
          </div>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">8. Information about minors</h2>
          <p>The system may be used to manage information about students who are minors (under 18).</p>
          <p className="mt-3">
            The business customer represents and confirms that it has the legal right to enter, store and
            process personal information relating to students who are minors, and that it has obtained the
            consents required by law from parents and/or legal guardians. The customer is responsible for
            providing appropriate privacy notices and for arranging consents in accordance with the law.
          </p>
          <p className="mt-3">
            Lessio is not responsible for verifying that the customer obtained the required consents, and
            will act in accordance with the law and with its privacy policy in respect of any request
            concerning such information.
          </p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">9. Privacy and data processing</h2>
          <p>
            The use of personal information collected through the service is governed by the Lessio
            privacy policy (available at <Link href="/privacy" className="text-violet-600 hover:underline">/privacy</Link>),
            which forms an integral part of these Terms.
          </p>
          <p className="mt-3">
            The customer grants Lessio permission to process the information needed to operate the
            service, provide support, maintain it and improve it. The Company may process information for
            security, technical support, performance analysis, legal compliance and prevention of misuse.
          </p>
          <p className="mt-3">
            Lessio <strong className="text-foreground">will not sell</strong> identifiable personal
            information to third parties for marketing purposes. The Company may process anonymous or
            aggregated data (which does not allow a specific person to be identified) in order to improve
            the service and analyse trends.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">10. Third-party providers</h2>
          <p>
            In order to provide the service, Lessio may rely on external providers, including but not
            limited to: WhatsApp/Meta, card-payment processors, invoicing providers, cloud providers,
            email and SMS services, and analytics providers.
          </p>
          <p className="mt-3">
            The Company is <strong className="text-foreground">not responsible</strong> for the
            availability, performance, policies, changes, blocks, faults, changes of terms or any failure
            of third-party providers — including a WhatsApp account being blocked, a payment failure, an
            API change, or a cloud service outage.
          </p>
          <p className="mt-3">
            The customer is responsible for connecting its accounts to external services, obtaining the
            required permissions, the correctness of its payment details, and complying with those
            providers&apos; terms of use.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">11. Payments, subscriptions and cancellations</h2>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.1 Plans and prices</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-border rounded">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border px-3 py-2 text-start font-medium text-foreground">Plan</th>
                  <th className="border border-border px-3 py-2 text-start font-medium text-foreground">Monthly</th>
                  <th className="border border-border px-3 py-2 text-start font-medium text-foreground">Annual</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Free (30-day trial)', '₪0', '—'],
                  ['Basic', '₪99/month', '₪990/year'],
                  ['Advanced', '₪199/month', '₪1,990/year'],
                  ['Custom', 'By quote', '—'],
                ].map(([plan, monthly, annual]) => (
                  <tr key={plan}>
                    <td className="border border-border px-3 py-2">{plan}</td>
                    <td className="border border-border px-3 py-2">{monthly}</td>
                    <td className="border border-border px-3 py-2">{annual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Prices exclude VAT. Lessio reserves the right to change prices on 30 days&apos; notice.
          </p>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.2 Late payment</h3>
          <p>
            Late payment may lead to restricted access to the service, suspension of the account, and — in
            the case of prolonged non-payment — termination of the engagement. The Company will send a
            reminder before taking any such step.
          </p>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.3 Cancellation</h3>
          <p>
            The customer may cancel its subscription at any time by emailing{' '}
            <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
            {' '}or by clicking &quot;Cancel subscription&quot; in the account management screen.
            Cancellation takes effect at the end of the current billing period. No pro-rata refund is given
            for a period that has already begun, subject to any mandatory law.
          </p>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.4 Refund policy</h3>
          <p>
            A customer within <strong className="text-foreground">14 days of the first charge only</strong>{' '}
            may request a full refund. After that, no pro-rata refund is given, subject to any mandatory law.
          </p>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.5 Consumer customers</h3>
          <p>
            Where the customer is a &quot;consumer&quot; as defined in the Israeli Consumer Protection Law,
            5741-1981, the cancellation rights set out in that law apply, including the right to cancel a
            transaction within 14 days, to the extent it applies in the circumstances of the specific
            transaction.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">12. Availability, maintenance and changes</h2>
          <p>
            The service is provided <strong className="text-foreground">&quot;as is&quot; and &quot;as available&quot;</strong>,
            without any undertaking as to continuous availability, a particular level of performance,
            freedom from faults, or full fitness for the customer&apos;s needs. The Company does not commit
            to a specific service level (SLA) unless agreed otherwise in a separate written agreement.
          </p>
          <p className="mt-3">
            There may be planned outages for maintenance, updates and upgrades — the Company will make
            reasonable efforts to carry out maintenance outside peak hours. There may also be unplanned
            outages arising from third-party infrastructure, which are outside the Company&apos;s control.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">13. Prohibited use</h2>
          <p className="mb-2">The customer undertakes not to do, and not to allow others to do, any of the following:</p>
          <ul className="list-disc list-inside space-y-1 ms-3">
            {[
              'Use the service for any unlawful, misleading or fraudulent purpose, or one that infringes the rights of others.',
              'Process, store or transmit personal information without lawful authorisation, contrary to the Protection of Privacy Law.',
              'Send commercial messages, advertising or spam without the recipient’s express consent, as required by the Communications Law.',
              'Attempt to break in, access without authorisation, circumvent security mechanisms, reverse engineer, scrape automatically, carry out a denial-of-service attack, or otherwise harm the operation of the system.',
              'Impersonate a person, a business, a Lessio representative, a government authority or any other party.',
              'Enter information that is incorrect, misleading, unauthorised, stolen, infringing, inciting, obscene, offensive, defamatory or unlawful.',
              'Use the service in breach of the terms of WhatsApp/Meta, payment processors, invoicing providers or any third-party provider.',
              'Sell, transfer, rent or sub-license access to a third party without express written approval.',
            ].map(item => <li key={item}>{item}</li>)}
          </ul>
        </section>

        {/* 14 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">14. Intellectual property</h2>
          <p>
            All rights in the Lessio platform — including source code, design, brand, logo, business
            logic, processes, screens, interfaces and documentation — belong to the Company and/or its
            licensors and are protected by intellectual property law.
          </p>
          <p className="mt-3">
            The customer receives a personal, limited, non-exclusive, non-transferable and
            non-sublicensable licence to use the service for its internal purposes, for the duration of
            the engagement only.
          </p>
          <p className="mt-3">
            Customer content remains owned by the customer and/or the data subjects, under applicable law.
            Lessio may use anonymous and/or aggregated data (which does not allow a specific person to be
            identified) to improve the product and analyse performance.
          </p>
        </section>

        {/* 15 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">15. Confidentiality</h2>
          <p>
            Each party undertakes to keep confidential the other party&apos;s confidential business
            information disclosed to it during the engagement. This undertaking does not apply to
            information already known before disclosure, information that became public through no fault
            of the receiving party, or information required to be disclosed by law, court order or the
            demand of a competent authority. Lessio may disclose information to service providers acting
            on its behalf, provided they are subject to similar confidentiality obligations.
          </p>
        </section>

        {/* 16 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">16. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, Lessio will not be liable for indirect,
            consequential, incidental, special or punitive damages, or for loss of profits, revenue,
            transactions, customers, goodwill or data, even if it was advised of the possibility of such
            damage.
          </p>
          <p className="mt-3">
            Lessio is not liable for damage arising from: faults, blocks or changes by third-party
            providers; errors in information the customer entered; incorrect use by the customer;
            incorrect charges, cancellations or failures to collect arising from incorrect information
            supplied; or temporary unavailability of the system.
          </p>
          <p className="mt-3">
            Lessio&apos;s total liability to the customer, on any cause of action, will not exceed{' '}
            <strong className="text-foreground">the amounts actually paid to Lessio in the 3 months
            preceding the event giving rise to the damage</strong>.
          </p>
          <p className="mt-3">
            Nothing in these Terms limits liability that cannot be limited by law, including damage caused
            wilfully or by gross negligence.
          </p>
        </section>

        {/* 17 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">17. Indemnity</h2>
          <p className="mb-2">
            The customer undertakes to indemnify, defend and hold harmless Lessio, its directors,
            employees and suppliers against any claim, damage, expense or legal cost arising from:
          </p>
          <ul className="list-disc list-inside space-y-1 ms-3">
            {[
              'Prohibited use of the service by the customer or anyone on its behalf.',
              'Breach of any provision of these Terms or of any law applying to the customer.',
              'Breach of the privacy rights of parents, students, teachers, employees or third parties.',
              'Content the customer sent through the system.',
              'Failure to obtain the consents required by law.',
              'Disputes between the business customer and its own customers, students, their parents, its teachers or its employees.',
            ].map(item => <li key={item}>{item}</li>)}
          </ul>
        </section>

        {/* 18 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">18. Suspension, restriction and termination</h2>
          <p className="mb-2">
            Lessio may suspend, restrict or terminate the customer&apos;s access in the following cases:
          </p>
          <ul className="list-disc list-inside space-y-1 ms-3 mb-3">
            {[
              'A material breach of these terms of use.',
              'Non-payment not remedied within 7 business days of notice.',
              'A well-founded concern of unlawful use, fraud or harm to third parties.',
              'A binding demand from an official body, authority, court or third-party provider.',
              'An immediate security risk or harm to the operation of the system.',
            ].map(item => <li key={item}>{item}</li>)}
          </ul>
          <p>Where possible, Lessio will give advance notice before suspending access, except in security emergencies.</p>
          <p className="mt-3">
            After the engagement ends, access to the system may be blocked. Customer data is retained for{' '}
            <strong className="text-foreground">90 days</strong> after the engagement ends. During that
            period a data export may be requested in writing at{' '}
            <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>.
            After 90 days the information may be permanently deleted.
          </p>
        </section>

        {/* 19 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">19. Changes to the Terms</h2>
          <p>
            Lessio may update these Terms from time to time. A material change will be published in the
            user interface and/or sent by notice to the email address registered on the account, at least{' '}
            <strong className="text-foreground">14 days</strong> before the change takes effect.
            Continued use of the service after the changes take effect will be treated as acceptance of the
            updated Terms. A customer who does not agree may cancel its subscription before the changes
            take effect.
          </p>
        </section>

        {/* 20 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">20. Governing law and jurisdiction</h2>
          <p>
            These Terms are governed by the law of the State of Israel, without applying conflict-of-law
            rules that would refer to foreign law. Exclusive jurisdiction over any dispute lies with the
            competent courts of the <strong className="text-foreground">Tel Aviv district</strong>. Nothing
            in this clause derogates from a consumer&apos;s right to choose another competent forum, where
            the law allows it.
          </p>
        </section>

        {/* 21 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">21. Contact</h2>
          <div className="space-y-1">
            <p>
              <strong className="text-foreground">General support:</strong>{' '}
              <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
            </p>
            <p>
              <strong className="text-foreground">Legal and privacy enquiries:</strong>{' '}
              <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
            </p>
            <p><strong className="text-foreground">Phone:</strong> {tel}</p>
            <p><strong className="text-foreground">Postal address:</strong> {addr}</p>
          </div>
        </section>

      </div>
  )
}
