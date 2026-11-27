import React from 'react';

const sectionStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  marginBottom: 14,
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
};

const listStyle = { lineHeight: 1.75, paddingLeft: 22 };
const headingStyle = { color: '#174ea6', marginTop: 0 };

export default function CommunityGuidelines({ onBack }) {
  return (
    <main style={{ maxWidth: 760, margin: '24px auto', padding: '0 16px 36px', color: '#202124', fontFamily: 'Arial, sans-serif', lineHeight: 1.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 style={{ color: '#1877f2', margin: 0 }}>FACEBOOM Community Guidelines</h1>
        {onBack && <button type="button" onClick={onBack} style={{ border: 0, borderRadius: 7, padding: '10px 14px', background: '#e7f3ff', color: '#1877f2', cursor: 'pointer', fontWeight: 600 }}>Back</button>}
      </div>

      <section style={sectionStyle}>
        <p style={{ marginTop: 0 }}><strong>Our goal:</strong> FACEBOOM is a place to connect, share and communicate respectfully. These rules apply to profiles, posts, comments, photos, videos and messages shared through FACEBOOM. They are separate from Facebook's rules.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>Who can use FACEBOOM</h2>
        <p style={{ marginBottom: 0 }}>You must be at least 13 years old to create or use a FACEBOOM account. If the law where you live requires you to be older to use an online service like FACEBOOM, that higher minimum age applies. Do not create an account if you do not meet the age requirement.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>1. Treat people with respect</h2>
        <ul style={listStyle}>
          <li>No threats, targeted harassment, bullying, stalking or intimidation.</li>
          <li>No hate, dehumanization or encouragement of violence against a person or group.</li>
          <li>Do not organize or encourage others to abuse, threaten or target someone.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>2. Protect children and prevent sexual exploitation</h2>
        <ul style={listStyle}>
          <li>Never post, request, create, share or promote sexual content involving anyone under 18.</li>
          <li>No child exploitation, grooming, trafficking or content that puts a child at risk.</li>
          <li>No non-consensual intimate images or sexual exploitation of any person.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>3. Do not encourage violence or self-harm</h2>
        <ul style={listStyle}>
          <li>No credible threats, instructions or encouragement to hurt another person.</li>
          <li>Do not encourage suicide or self-harm, or praise another person's suffering.</li>
          <li>Content indicating an immediate danger may be escalated to appropriate safety channels or authorities where legally required or permitted.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>4. Keep accounts and content honest</h2>
        <ul style={listStyle}>
          <li>No scams, phishing, malware, fraudulent offers or deceptive schemes.</li>
          <li>Do not impersonate another person, organization or public authority.</li>
          <li>No spam, fake engagement, automated abuse or coordinated manipulation.</li>
          <li>Do not share another person's private information without permission.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>5. Follow the law and respect ownership</h2>
        <ul style={listStyle}>
          <li>Do not use FACEBOOM to buy, sell, promote or arrange illegal goods or services.</li>
          <li>Only upload content you created or have permission to share.</li>
          <li>Do not knowingly infringe copyright, trademarks or other people's rights.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>6. Reporting and blocking</h2>
        <p>Use the report controls provided in FACEBOOM when you see content or conduct that may break these rules. Include clear, relevant details. You can also block accounts to limit unwanted interactions. Do not make false or deliberately abusive reports.</p>
        <p style={{ marginBottom: 0 }}>Reports are reviewed by authorized FACEBOOM moderators. A report is not an automatic finding that a rule was broken.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>7. Moderation and enforcement</h2>
        <p>Depending on the seriousness of the conduct, evidence and relevant history, FACEBOOM may:</p>
        <ul style={listStyle}>
          <li>Remove content that breaks these rules.</li>
          <li>Issue a warning or restrict access to specific features.</li>
          <li>Temporarily suspend an account.</li>
          <li>Permanently disable an account for serious or repeated violations.</li>
          <li>Preserve relevant records and escalate serious safety concerns where appropriate.</li>
        </ul>
        <p style={{ marginBottom: 0 }}>FACEBOOM moderators make decisions under FACEBOOM's own rules. Connecting a Facebook account for sign-in does not make Facebook the moderator of a member's FACEBOOM account.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>8. Appeals</h2>
        <p>If your account is suspended or disabled, use the appeal form shown on the account restriction screen, where available. You may also email <a href="mailto:faceboom.support@gmail.com?subject=FACEBOOM%20Moderation%20Appeal">faceboom.support@gmail.com</a> with the subject <strong>FACEBOOM Moderation Appeal</strong>. Include your FACEBOOM username, the date of the action and why you believe it should be reviewed. Never send your password or verification codes.</p>
        <p>An appeal will be considered by an authorized moderator where possible. The decision may be upheld, changed or reversed; submitting an appeal does not guarantee a change.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>9. Safety and updates</h2>
        <p>These rules may be updated as FACEBOOM develops. Serious or immediate danger should be reported to local emergency services; FACEBOOM is not an emergency-response service and email is not monitored for emergencies.</p>
        <p>For questions, safety reports that cannot be submitted in the app, or moderation appeals, contact <a href="mailto:faceboom.support@gmail.com">faceboom.support@gmail.com</a>. Do not send passwords, sign-in codes or payment details.</p>
        <p style={{ marginBottom: 0, color: '#5f6368', fontSize: 13 }}>FACEBOOM may update these rules as the service and applicable requirements change.</p>
      </section>
    </main>
  );
}
