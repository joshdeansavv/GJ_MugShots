import { useState } from 'react';

// Discord webhook URL - Replace with your actual webhook URL
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1427707796186730527/vC_r5y2j8WqsP82cpT85hgtzLoDofg9IjOMhtyFOfNErMk9QFHAtiCPDGfaz1tasiQoc';

export function AboutPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    agreeToTerms: false,
    agreeToPrivacy: false
  });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error' | 'sending'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check consent checkboxes
    if (!formData.agreeToTerms || !formData.agreeToPrivacy) {
      setSubmitStatus('error');
      setTimeout(() => setSubmitStatus('idle'), 3000);
      return;
    }

    setSubmitStatus('sending');

    try {
      // Format the Discord webhook message
      const discordMessage = {
        embeds: [{
          title: '📬 New Contact Form Submission',
          color: 0x6366f1, // Indigo color
          fields: [
            {
              name: '👤 Name',
              value: formData.name,
              inline: true
            },
            {
              name: '📧 Email',
              value: formData.email,
              inline: true
            },
            {
              name: '📋 Subject',
              value: formData.subject || 'Not specified',
              inline: false
            },
            {
              name: '💬 Message',
              value: formData.message || 'No message provided',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'GJ Mugshots Contact Form'
          }
        }]
      };

      // Send to Discord webhook
      const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordMessage)
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setSubmitStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '', agreeToTerms: false, agreeToPrivacy: false });

      // Reset status after 5 seconds
      setTimeout(() => setSubmitStatus('idle'), 5000);
    } catch (error) {
      console.error('Error sending to Discord:', error);
      setSubmitStatus('error');
      setTimeout(() => setSubmitStatus('idle'), 5000);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Contact Section */}
      <section className="bg-zinc-900/50 rounded-xl p-6 sm:p-8 border border-zinc-800">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-6">Contact Us</h1>

        <p className="text-zinc-300 mb-6">
          Have questions, concerns, or need to report an issue? Please fill out the form below and we'll get back to you as soon as possible.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-zinc-300 mb-2">
                Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Your name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-2">
                Email *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="your.email@example.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-zinc-300 mb-2">
              Subject *
            </label>
            <select
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Select a subject</option>
              <option value="general">General Inquiry</option>
              <option value="correction">Request Record Correction</option>
              <option value="removal">Request Record Removal</option>
              <option value="technical">Technical Issue</option>
              <option value="legal">Legal Question</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-zinc-300 mb-2">
              Message *
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              required
              rows={6}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              placeholder="Please provide as much detail as possible..."
            />
          </div>

          {/* Consent Checkboxes */}
          <div className="space-y-4 border-t border-zinc-700 pt-6">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="agreeToTerms"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleChange}
                required
                className="mt-1 h-4 w-4 text-indigo-600 bg-zinc-800 border-zinc-600 rounded focus:ring-indigo-500 focus:ring-2"
              />
              <label htmlFor="agreeToTerms" className="text-sm text-zinc-300">
                I agree to the{' '}
                <a href="#/terms-of-service" className="text-indigo-400 hover:text-indigo-300 underline">
                  Terms of Service
                </a>
                {' '}*
              </label>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="agreeToPrivacy"
                name="agreeToPrivacy"
                checked={formData.agreeToPrivacy}
                onChange={handleChange}
                required
                className="mt-1 h-4 w-4 text-indigo-600 bg-zinc-800 border-zinc-600 rounded focus:ring-indigo-500 focus:ring-2"
              />
              <label htmlFor="agreeToPrivacy" className="text-sm text-zinc-300">
                I agree to the{' '}
                <a href="#/privacy-policy" className="text-indigo-400 hover:text-indigo-300 underline">
                  Privacy Policy
                </a>
                {' '}*
              </label>
            </div>
          </div>

          {submitStatus === 'sending' && (
            <div className="bg-indigo-900/20 border border-indigo-700/50 rounded-lg p-4 text-indigo-200 flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full"></div>
              Sending message...
            </div>
          )}

          {submitStatus === 'success' && (
            <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-green-200">
              Thank you for your message! We'll get back to you soon.
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 text-red-200">
              {submitStatus === 'error' && (!formData.agreeToTerms || !formData.agreeToPrivacy)
                ? 'Please agree to the Terms of Service and Privacy Policy to submit your message.'
                : 'There was an error submitting your message. Please try again.'}
            </div>
          )}

          <button
            type="submit"
            disabled={submitStatus === 'sending'}
            className="w-full sm:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitStatus === 'sending' ? 'Sending...' : 'Send Message'}
          </button>
        </form>

        {/* Legal Links Below Form */}
        <div className="mt-8 pt-6 border-t border-zinc-700">
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="#/terms-of-service"
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-lg text-center font-medium transition-colors"
            >
              Terms of Service
            </a>
            <a
              href="#/privacy-policy"
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-lg text-center font-medium transition-colors"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </section>

      {/* Record Removal Information */}
      <section className="bg-zinc-900/50 rounded-xl p-6 sm:p-8 border border-zinc-800">
        <h2 className="text-2xl font-semibold text-white mb-4">Record Removal Requests</h2>
        <p className="text-zinc-300 mb-4">
          If your case was dismissed, you were found not guilty, or you believe your record should be removed,
          please contact us using the form above with "Request Record Removal" as the subject. Include:
        </p>
        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
          <li>Your full name as it appears in the record</li>
          <li>Booking date and/or case number</li>
          <li>Documentation supporting your removal request (court orders, dismissal notices, etc.)</li>
        </ul>
      </section>
    </div>
  );
}

