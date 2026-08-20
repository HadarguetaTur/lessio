import Link from 'next/link'

import type { LegalDocProps } from '../terms/types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground mb-2">{title}</h2>
      <div className="text-sm leading-relaxed text-muted-foreground space-y-3">{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 ps-2">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

/**
 * English privacy policy — a translation of PrivacyHe, kept as a sibling
 * component rather than catalog strings because the prose carries inline markup,
 * links and tables. The Hebrew version remains the counsel-reviewed original.
 */
export function PrivacyEn({
  email,
  addr,
  tel,
  reg,
  entityName,
}: LegalDocProps & { entityName: string }) {
  return (
      <div className="mt-8 space-y-8">

        {/* 1 */}
        <Section title="1. Who we are">
          <p>
            <strong className="text-foreground">{entityName}</strong>, exempt dealer number{' '}
            <strong className="text-foreground">{reg}</strong>, of{' '}
            <strong className="text-foreground">{addr}</strong>, operates the{' '}
            <strong className="text-foreground">Lessio</strong> platform — a SaaS system for running
            private tutoring businesses and learning centres.
          </p>
          <p>
            For the purposes of this policy, &quot;the Company&quot;, &quot;we&quot; and
            &quot;Lessio&quot; refer to {entityName}.
          </p>
          <p>
            Privacy enquiries:{' '}
            <a
              href={`mailto:${email}`}
              className="text-violet-600 hover:underline dark:text-violet-400"
            >
              {email}
            </a>
          </p>
        </Section>

        {/* 2 */}
        <Section title="2. Definitions">
          <Ul
            items={[
              '"The system" / "Lessio" — the software-as-a-service (SaaS) platform operated by the Company, including the management interface, the parent portal, the API and any accompanying service.',
              '"Business customer" — a private tutor, learning centre, art school, studio, or any other business or entity that registers and uses the system to run its own business.',
              '"End user" — any person whose personal information is entered into the system, including students, parents, guardians, teachers and employees — whether they interact with the system themselves or the information was entered by the business customer.',
              '"Personal information" — any information relating to an identified or identifiable person, as defined in the Israeli Protection of Privacy Law, 5741-1981.',
              '"Sensitive information" — information about a person concerning their religious beliefs, health, family circumstances, and any information the law classifies as particularly sensitive.',
              '"Third-party providers" — external companies and service providers the Company engages in order to operate the system and provide the service.',
            ]}
          />
        </Section>

        {/* 3 */}
        <Section title="3. Lessio's role in relation to personal information">
          <SubSection title="3.1 Information about business customers">
            <p>
              In respect of information given to us by the business customer itself in order to manage
              its account, receive the service, be billed for the subscription, get technical support and
              receive marketing — the business customer is the data subject, and the Company acts as the
              party responsible for processing that information for those purposes.
            </p>
          </SubSection>
          <SubSection title="3.2 Information a business customer enters about students, parents and others">
            <p>
              When a business customer enters information about its students, their parents, its teachers,
              its employees and its customers —{' '}
              <strong className="text-foreground">the business customer is primarily responsible</strong>{' '}
              for that information. Responsibility for legal compliance in respect of it — including
              establishing a lawful basis for collection, giving notice to data subjects and obtaining the
              required consents — rests first and foremost with the business customer.
            </p>
            <p>
              Lessio processes this information in accordance with the business customer&apos;s
              instructions and for the purposes of operating the system, providing the service, securing
              information, giving technical support and meeting legal requirements. Lessio does not use
              this information for independent purposes unrelated to the service.
            </p>
            <p>
              Although the business customer bears primary responsibility as described, Lessio undertakes
              to meet the obligations that apply to it by law in respect of all information held in the
              system.
            </p>
          </SubSection>
        </Section>

        {/* 4 */}
        <Section title="4. What information we collect">
          <SubSection title="4.1 Business customer account information">
            <p>
              Full name and business name, email address, phone number, role in the business, billing
              details for the Lessio subscription, identifiers from the payment processor (payment
              instrument details are held only by the payment processor — see section 7), and information
              provided during onboarding and sales conversations.
            </p>
          </SubSection>
          <SubSection title="4.2 Information about students, parents and contacts">
            <p>
              Names of students and their parents/guardians, phone numbers and contact details, family
              relationships, age or date of birth where entered, and operational notes added by the
              business customer.
            </p>
          </SubSection>
          <SubSection title="4.3 Lesson and schedule details">
            <p>
              Lesson times, assigned teachers, availability and its updates, cancellations, attendance and
              absences, lesson status and lesson notes.
            </p>
          </SubSection>
          <SubSection title="4.4 Charge and payment details">
            <p>
              Charge amounts, charge dates, payment status, payment links created, charge and receipt
              history, and identifiers received from external payment and invoicing providers.{' '}
              <strong className="text-foreground">
                Lessio is not a payment processor and does not store full card details
              </strong>{' '}
              — those are held only by the payment processors, in accordance with PCI-DSS.
            </p>
          </SubSection>
          <SubSection title="4.5 Communications and messages">
            <p>
              WhatsApp messages sent and/or received through the system, automatic reminders, system
              notifications, and records of support enquiries.
            </p>
            <p>
              We also keep a record of messaging consent: its source (declared by the business,
              import, parent portal sign-in, booking form, or the parent messaging the business
              first), when it was given, which member of the business staff declared it, and when
              the one-time welcome notice was sent. An opt-out request (&quot;stop&quot; / &quot;הסר&quot;) is
              likewise recorded with its timestamp and blocks all future business-initiated messages.
            </p>
          </SubSection>
          <SubSection title="4.6 Technical information and logs">
            <p>
              IP address, browser and device type, operating system, actions taken in the system, sign-in
              dates and times, error logs and API version information.
            </p>
          </SubSection>
          <SubSection title="4.7 Cookies and tracking technologies">
            <p>
              The website and the system use cookies and similar tracking technologies for the following
              purposes, through the tools listed:
            </p>
            <Ul
              items={[
                'Google Analytics 4 (GA4) — analysing traffic and usage patterns on the website and in the system.',
                'Meta Pixel — tracking advertising conversions and improving campaigns.',
                'PostHog — analysing user behaviour and improving the product experience.',
                'Hotjar — mapping the user experience (heatmaps, session recordings).',
                'Sentry — monitoring errors and detecting technical faults in real time.',
              ]}
            />
          </SubSection>
        </Section>

        {/* 5 */}
        <Section title="5. Why we use the information">
          <Ul
            items={[
              'Operating the system and providing the service — managing accounts, lessons, calendars, cancellations, reminders and the parent portal.',
              'Managing charges — creating payment requests, tracking statuses, connecting to payment and invoicing providers.',
              'Communicating with the customer — WhatsApp messages, lesson reminders, operational updates.',
              'Technical support and customer service — handling enquiries, diagnosing problems and controlled support access.',
              'Information security and control — detecting intrusion attempts, monitoring anomalies, retaining logs for investigation.',
              'Improving the product and analysing usage — understanding usage patterns to improve the user experience, generally on the basis of aggregated information.',
              'Marketing updates — to business customers only, with consent and with an opt-out.',
              'Legal and regulatory compliance — accounting, complying with court orders and responding to competent authorities.',
            ]}
          />
        </Section>

        {/* 6 */}
        <Section title="6. Is providing information mandatory?">
          <p>
            Providing personal information to Lessio is not a legal obligation. However, certain
            information is necessary in order to open an account and operate the service:
          </p>
          <Ul
            items={[
              'Without basic account details (name, email, phone) — an account cannot be opened.',
              'Without student and lesson details — a calendar cannot be managed, reminders cannot be sent and charges cannot be handled.',
              'Without payment details for the subscription account — the paid version cannot continue to be used.',
            ]}
          />
          <p>
            Some accounting information may be required by legal obligation (for example, retaining
            accounting documents under the law). In such cases we will say so explicitly at the point of
            collection wherever possible.
          </p>
        </Section>

        {/* 7 */}
        <Section title="7. Sharing information with third parties">
          <p className="font-medium text-foreground">We do not sell personal information to third parties.</p>
          <p>Information may be passed to the following parties solely in order to operate the service:</p>
          <Ul
            items={[
              'Infrastructure and hosting — Supabase (database, authentication and file storage, on Amazon Web Services infrastructure) and Vercel (application hosting and processing of incoming WhatsApp messages).',
              'Communications — WhatsApp Business / Meta for sending and receiving messages and reminders; Resend for system emails; SMS providers where used.',
              'AI assistant (optional) — where a business customer enables the AI assistant, message content is sent for processing to the AI provider the customer selected (OpenAI or Anthropic), using the customer’s own API key.',
              'Google services (optional) — where a business customer connects their Google account, lesson details and messages may be synced to Google Calendar or sent through Gmail, under the customer’s own Google account.',
              'Payments and processing — payment providers the business customer chose to connect (such as Cardcom, PayPlus, Bit, PayBox).',
              'Invoicing — invoicing providers the business customer connected (such as Green Invoice, iCount); and Sumit for billing Lessio’s own SaaS subscriptions.',
              'Monitoring and support — providers of monitoring, logging and error-diagnosis tools (such as Sentry) and product analytics tools.',
              'Professional advisers — lawyers and accountants, to a defined extent and under professional privilege.',
              'Competent bodies under the law — enforcement authorities, courts and regulators, where there is a legal obligation or a court order.',
            ]}
          />
          <p>
            All third-party providers are obliged to safeguard the information and to comply with the law
            that applies to them.
          </p>
          <SubSection title="7.1 Integrations the business customer connects">
            <p>
              Some of the providers listed above (payment, invoicing, Google and AI providers) are not
              engaged by Lessio but are connected by the business customer, using the customer’s own
              account and credentials. Once connected, Lessio transfers to such a provider only the
              information required for the specific action the customer initiated (for example, the
              name and amount on an invoice, or a calendar event). The provider processes that
              information under its own terms of service and privacy policy, and the business customer
              is responsible for the choice of provider and for its use. The customer can disconnect an
              integration at any time from the system settings, after which no further information is
              transferred to that provider.
            </p>
          </SubSection>
        </Section>

        {/* 8 */}
        <Section title="8. Transfers of information outside Israel">
          <p>
            Information may be stored and processed outside Israel, including within the European Union
            (mainly AWS and Supabase regions in Europe), and in the countries where the various service
            providers are located.
          </p>
          <p>When personal information is transferred outside Israel, we work to ensure it is done:</p>
          <Ul
            items={[
              'to countries determined to provide an adequate level of privacy protection;',
              'under contractual agreements that include undertakings to protect the information;',
              'in accordance with any direction issued by the Privacy Protection Authority under Amendment 13 to the law.',
            ]}
          />
        </Section>

        {/* 9 */}
        <Section title="9. Retention and deletion">
          <p>
            We retain personal information for as long as it is needed to operate the account, provide the
            service, meet legal and regulatory obligations, resolve disputes, secure information and
            manage backups.
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-start px-3 py-2 font-medium text-foreground">Type of information</th>
                  <th className="text-start px-3 py-2 font-medium text-foreground">Retention period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-3 py-2">Operational data (lessons, students, charges)</td>
                  <td className="px-3 py-2">3 years from the end of the engagement</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">System and security logs</td>
                  <td className="px-3 py-2">12 months</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Backups</td>
                  <td className="px-3 py-2">90 days</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Accounting documents</td>
                  <td className="px-3 py-2">No less than 7 years (under tax law)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            When the engagement ends, the customer may request an export of its data in a reasonable
            format. Immediate deletion from every backup system is not always possible — information may
            remain in backups until the regular backup cycle completes, and will not be accessible for
            active use.
          </p>
        </Section>

        {/* 10 */}
        <Section title="10. Data subject rights">
          <p>
            Under the Israeli Protection of Privacy Law, 5741-1981 and its amendments (including
            Amendment 13), a person is entitled to make a request to:
          </p>
          <Ul
            items={[
              'Access information — to receive information about the personal information held about them in Lessio’s databases.',
              'Correct information — to request correction of information that is inaccurate, incomplete, unclear or out of date.',
              'Delete or restrict — to request deletion of information or restriction of its processing, subject to legal retention obligations and the needs of dispute resolution.',
            ]}
          />
          <p>
            <strong className="text-foreground">Making a request:</strong> write to{' '}
            <a
              href={`mailto:${email}`}
              className="text-violet-600 hover:underline dark:text-violet-400"
            >
              {email}
            </a>{' '}
            setting out: full name, contact details, a description of the information the request concerns
            and the type of request. We may need to verify the requester&apos;s identity before
            responding. Detailed instructions for requesting data deletion are available on the{' '}
            <Link
              href="/data-deletion"
              className="text-violet-600 hover:underline dark:text-violet-400"
            >
              data deletion instructions
            </Link>{' '}
            page.
          </p>
          <p>
            <strong className="text-foreground">Where the information was entered by a business customer:</strong>{' '}
            Lessio may refer the requester to that business customer, since it is the party that collected
            the information and is responsible for it, or handle the request in coordination with it.
          </p>
          <p>
            You may also contact the Privacy Protection Authority at the Israeli Ministry of Justice on
            any matter concerning rights under the law.
          </p>
        </Section>

        {/* 11 */}
        <Section title="11. Information about minors">
          <p>
            The system is intended for use by adult business customers and may include information about
            students who are minors, entered by the business customer or by the parent/guardian.
          </p>
          <Ul
            items={[
              'Lessio does not allow minors to register and use the system independently without the consent of a parent or guardian, or appropriate authorisation from the business customer.',
              'The business customer is responsible for ensuring it is entitled to enter information about minors into the system, including obtaining parent/guardian consent where the law requires it.',
              'Lessio handles information about minors carefully and in accordance with the law, and does not use it beyond what is needed to operate the service.',
              'If we learn that information about a minor was collected without appropriate authorisation, we will act to delete it.',
            ]}
          />
        </Section>

        {/* 12 */}
        <Section title="12. Information security">
          <p>
            The Company acts in accordance with the Protection of Privacy Regulations (Data Security),
            5777-2017, and applies accepted security measures appropriate to the nature of the information
            held, including:
          </p>
          <Ul
            items={[
              'Access controls — access to information is limited to those authorised by their role.',
              'Role-based permissions — Lessio staff access information only to the extent their role requires.',
              'Encryption — information is transmitted over encrypted channels (TLS/HTTPS); sensitive information is also encrypted at rest.',
              'Customer separation — each business customer is held in an environment logically isolated from other customers.',
              'Backups — information is backed up regularly.',
              'Monitoring and logging — ongoing monitoring is in place to detect anomalies and security events.',
              'Security incident procedures — procedures exist for handling security events, including assessment, damage limitation and reporting.',
            ]}
          />
          <p>
            We cannot guarantee absolute security. We work to reduce security risks to the reasonable
            minimum.
          </p>
        </Section>

        {/* 13 */}
        <Section title="13. Security incidents">
          <p>
            If a security incident is suspected that could harm the privacy of data subjects, Lessio will
            act immediately to investigate it, limit its damage and restore operation.
          </p>
          <p>
            Notice will be given to the relevant parties in accordance with the applicable law and the
            circumstances — including notice to affected business customers and, where required, to the
            Privacy Protection Authority.
          </p>
          <p>
            Where a business customer is required to notify data subjects about an incident affecting
            information it entered, Lessio will cooperate with it reasonably and provide the information
            available to it for that purpose.
          </p>
        </Section>

        {/* 14 */}
        <Section title="14. Cookies and tracking technologies">
          <p>
            The Lessio website and/or system may use cookies and similar tracking technologies:
          </p>
          <Ul
            items={[
              'Essential cookies — required to operate the system and manage the sign-in session. These cannot be disabled.',
              'Analytics cookies — Google Analytics 4 and PostHog for usage analysis and product improvement; Hotjar for mapping the user experience.',
              'Marketing cookies — Meta Pixel for tracking advertising conversions.',
              'Error-monitoring cookies — Sentry for detecting and recording technical faults.',
            ]}
          />
          <p>
            You can manage your cookie preferences through your browser settings. Using the website and
            the system after registering constitutes consent to essential cookies. Analytics and marketing
            cookies can be restricted through browser settings.
          </p>
        </Section>

        {/* 15 */}
        <Section title="15. Marketing and communications">
          <p>
            <strong className="text-foreground">Operational messages:</strong> messages necessary to
            operate the service (system updates, registration confirmations, changes to the terms of
            service, security alerts) are sent without an opt-out, since they are an inseparable part of
            the service.
          </p>
          <p>
            <strong className="text-foreground">Lessio marketing messages:</strong> updates, tips and
            offers are sent to business customers in accordance with Israeli law, with consent and with an
            opt-out in every message.
          </p>
          <p>
            <strong className="text-foreground">Messages a business customer sends to its own customers:</strong>{' '}
            Lessio is the technical infrastructure for sending WhatsApp messages and reminders on the
            business customer&apos;s behalf. The business customer is responsible for obtaining consent
            and complying with the law in respect of those messages.
          </p>
        </Section>

        {/* 16 */}
        <Section title="16. Changes to this privacy policy">
          <p>
            We may update this policy from time to time. The date of the last update is shown at the top
            of the document.
          </p>
          <p>
            In the case of a material change, we will notify business customers in a way we consider
            appropriate (email, an in-system notice, and so on). Continued use of the system after the
            change is published constitutes acceptance of the updated terms.
          </p>
        </Section>

        {/* 17 */}
        <Section title="17. Contact">
          <p>For any question, request or enquiry regarding privacy:</p>
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-1">
            <p>
              <strong className="text-foreground">{entityName}</strong>
            </p>
            <p>
              Privacy contact: <strong className="text-foreground">{entityName}</strong>
            </p>
            <p>
              Email:{' '}
              <a
                href={`mailto:${email}`}
                className="text-violet-600 hover:underline dark:text-violet-400"
              >
                {email}
              </a>
            </p>
            <p>
              Phone: <strong className="text-foreground">{tel}</strong>
            </p>
            <p>
              Address: <strong className="text-foreground">{addr}</strong>
            </p>
          </div>
          <p>We aim to respond to privacy enquiries within 30 days.</p>
        </Section>
      </div>
  )
}
