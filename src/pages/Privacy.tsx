import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Palmtree } from "lucide-react";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link to="/">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Palmtree className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Aloha Card Shop</h1>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">Privacy Policy</h2>
          <p className="text-muted-foreground mt-2">Last updated: January 18, 2026</p>
        </div>

        {/* Content */}
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h3 className="text-xl font-semibold mb-3">1. Introduction</h3>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to Aloha Card Shop. We are committed to protecting your personal information 
              and your right to privacy. This Privacy Policy explains how we collect, use, disclose, 
              and safeguard your information when you use our inventory management and e-commerce 
              integration services.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">2. Information We Collect</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Account information (email address, name)</li>
              <li>Inventory data (product information, pricing, stock levels)</li>
              <li>Transaction records and order history</li>
              <li>Integration credentials for connected platforms (eBay, Shopify)</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">3. How We Use Your Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Provide and maintain our inventory management services</li>
              <li>Sync your inventory across connected e-commerce platforms</li>
              <li>Process and fulfill orders</li>
              <li>Send you important updates about our services</li>
              <li>Improve and optimize our platform</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">4. eBay Integration</h3>
            <p className="text-muted-foreground leading-relaxed">
              When you connect your eBay account, we access your eBay seller information to 
              sync inventory listings, manage orders, and update stock levels. We only access 
              the data necessary to provide our services and do not sell or share your eBay 
              data with third parties for their own marketing purposes. Your eBay credentials 
              are securely stored and encrypted.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">5. Shopify Integration</h3>
            <p className="text-muted-foreground leading-relaxed">
              When you connect your Shopify store, we access your product catalog, inventory 
              levels, and order information to synchronize with our platform. This integration 
              allows us to maintain accurate inventory counts across all your sales channels.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">6. Data Security</h3>
            <p className="text-muted-foreground leading-relaxed">
              We implement appropriate technical and organizational security measures to protect 
              your personal information. This includes encryption of sensitive data, secure 
              authentication protocols, and regular security assessments. However, no method 
              of transmission over the Internet is 100% secure, and we cannot guarantee 
              absolute security.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">7. Third-Party Services</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We use the following third-party services to operate our platform:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Supabase:</strong> Database and authentication services</li>
              <li><strong>eBay:</strong> E-commerce marketplace integration</li>
              <li><strong>Shopify:</strong> E-commerce platform integration</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Each of these services has their own privacy policies governing their use of data.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">8. Data Retention</h3>
            <p className="text-muted-foreground leading-relaxed">
              We retain your personal information for as long as your account is active or as 
              needed to provide you services. If you wish to delete your account, please 
              contact us and we will delete your data within 30 days, unless we are legally 
              required to retain it.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">9. Your Rights</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              You have the right to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your personal information</li>
              <li>Disconnect third-party integrations at any time</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">10. Changes to This Policy</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any 
              changes by posting the new Privacy Policy on this page and updating the 
              "Last updated" date.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">11. Contact Us</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, 
              please contact us at:
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Aloha Card Shop</strong><br />
              Email: support@alohacardshop.com
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t">
          <p className="text-sm text-muted-foreground text-center">
            © {new Date().getFullYear()} Aloha Card Shop. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
