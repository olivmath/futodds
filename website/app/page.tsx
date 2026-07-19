import AwardsSection from "@/components/AwardsSection";
import BentoSection from "@/components/BentoSection";
import CookieBanner from "@/components/CookieBanner";
import Faq from "@/components/Faq";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import InvestorSection from "@/components/InvestorSection";
import Navbar from "@/components/Navbar";
import PhoneSection from "@/components/PhoneSection";
import TrustSection from "@/components/TrustSection";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <PhoneSection />
        <BentoSection />
        <TrustSection />
        <InvestorSection />
        <AwardsSection />
        <Faq />
      </main>
      <Footer />
      <CookieBanner />
    </>
  );
}
