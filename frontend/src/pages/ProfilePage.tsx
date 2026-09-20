import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { useBookings } from "../hooks/useBookings";
import { Header } from "../app/components/header";
import { Footer } from "../app/components/footer";
import { User, Phone, Mail, Calendar, Edit2, Shield } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuthStore();
  const { data: bookings } = useBookings();
  const [isHovered, setIsHovered] = useState(false);

  const totalBookings = bookings?.filter(b => !b.isDraft).length ?? 0;
  const completedBookings = bookings?.filter(b => b.status === 'COMPLETED').length ?? 0;
  const upcomingBookings = bookings?.filter(b => b.status === 'CONFIRMED').length ?? 0;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#030712]">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-slate-400">Loading...</div>
        </div>
        <Footer />
      </div>
    );
  }

  const detectGender = (name: string): 'male' | 'female' => {
    if (!name) return 'male';
    const lowerName = name.toLowerCase();
    const femalePatterns = ['a', 'i', 'ya', 'ia', 'ella', 'ina', 'ana'];
    const femaleNames = ['priya', 'anjali', 'neha', 'pooja', 'kavya', 'shreya', 'divya', 'riya', 'sneha', 'nikita', 'sakshi', 'tanvi', 'isha', 'ananya', 'aisha', 'maya', 'sara', 'zara', 'emily', 'sophia', 'emma', 'olivia', 'ava', 'isabella', 'mia', 'charlotte', 'amelia', 'harper', 'evelyn'];
    if (femaleNames.some(fn => lowerName.includes(fn))) return 'female';
    if (femalePatterns.some(pattern => lowerName.endsWith(pattern))) return 'female';
    return 'male';
  };

  const gender = detectGender(user.name || '');
  const avatarUrl = `https://api.dicebear.com/7.x/${gender === 'female' ? 'avataaars' : 'avataaars'}/svg?seed=${encodeURIComponent(user.name || 'User')}&backgroundColor=2F86C7&radius=50`;

  return (
    <div className="min-h-screen bg-[#030712] relative overflow-hidden">
      {/* Neural grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(47,134,199,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(47,134,199,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 100% 60% at 50% 0%, black 30%, transparent 100%)",
        }}
      />
      {/* Ambient orb */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full blur-[140px] bg-[#2F86C7]/6 pointer-events-none" />

      <Header />

      <main className="relative z-10 container mx-auto px-4 py-12 max-w-4xl">
        {/* Page Title */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4"
            style={{ background: "rgba(47,134,199,0.1)", border: "1px solid rgba(47,134,199,0.2)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#2F86C7] animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-[#60b5e8]">My Account</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">My Profile</h1>
          <p className="text-slate-400">Manage your account information</p>
        </div>

        {/* Main Profile Card */}
        <div className="rounded-3xl overflow-hidden mb-8"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}>
          {/* Banner */}
          <div className="relative h-36 overflow-hidden"
            style={{ background: "linear-gradient(135deg, rgba(47,134,199,0.3) 0%, rgba(13,148,136,0.2) 50%, rgba(47,134,199,0.15) 100%)" }}>
            <div className="absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.03) 1px, transparent 1px), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.03) 1px, transparent 1px)",
                backgroundSize: "50px 50px",
              }}
            />
            {/* Top glow line */}
            <div className="absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(47,134,199,0.6), rgba(13,148,136,0.4), transparent)" }} />
          </div>

          {/* Profile Content */}
          <div className="relative px-8 pb-8">
            {/* Avatar */}
            <div className="absolute -top-16 left-8">
              <div
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="relative"
              >
                <div className="w-32 h-32 rounded-full overflow-hidden transition-transform duration-300 hover:scale-105"
                  style={{ border: "3px solid rgba(47,134,199,0.4)", boxShadow: "0 0 32px rgba(47,134,199,0.3), 0 8px 32px rgba(0,0,0,0.5)" }}>
                  <img src={avatarUrl} alt={user.name || 'User'} className="w-full h-full object-cover" />
                </div>
                {/* Online dot */}
                <div className="absolute bottom-2 right-2 w-4 h-4 rounded-full bg-emerald-400"
                  style={{ boxShadow: "0 0 8px #34d399", border: "2px solid #030712" }} />
              </div>
            </div>

            <div className="pt-20">
              {/* Name and Badges */}
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-3">
                    {user.name || 'User'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold"
                      style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399" }}>
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                      Active Member
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold"
                      style={{ background: "rgba(47,134,199,0.12)", border: "1px solid rgba(47,134,199,0.25)", color: "#60b5e8" }}>
                      <Shield className="w-3 h-3" />
                      Verified
                    </span>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px mb-8"
                style={{ background: "linear-gradient(90deg, transparent, rgba(47,134,199,0.2), transparent)" }} />

              {/* Profile Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <ProfileInfoCard
                  icon={<User className="w-4 h-4" />}
                  label="Full Name"
                  value={user.name || 'Not provided'}
                  accentColor="#2F86C7"
                />
                <ProfileInfoCard
                  icon={<Phone className="w-4 h-4" />}
                  label="Phone Number"
                  value={user.phone}
                  accentColor="#0D9488"
                />
                {user.email && (
                  <ProfileInfoCard
                    icon={<Mail className="w-4 h-4" />}
                    label="Email Address"
                    value={user.email}
                    accentColor="#6366f1"
                  />
                )}
                <ProfileInfoCard
                  icon={<Calendar className="w-4 h-4" />}
                  label="Member Since"
                  value={
                    user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'long', day: 'numeric',
                        })
                      : 'Recently joined'
                  }
                  accentColor="#8b5cf6"
                />
              </div>

              {/* Edit Button */}
              <button
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.01]"
                style={{
                  background: "linear-gradient(135deg, #2F86C7, #1E6FA8)",
                  boxShadow: "0 4px 20px rgba(47,134,199,0.3)",
                }}
                onClick={() => alert('Edit profile feature coming soon!')}
              >
                <Edit2 className="w-4 h-4" />
                Edit Profile
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatsCard title="Total Bookings" value={String(totalBookings)} accentColor="#2F86C7" />
          <StatsCard title="Completed" value={String(completedBookings)} accentColor="#0D9488" />
          <StatsCard title="Upcoming" value={String(upcomingBookings)} accentColor="#8b5cf6" />
        </div>
      </main>

      <Footer />
    </div>
  );
}

interface ProfileInfoCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accentColor: string;
}

const ProfileInfoCard: React.FC<ProfileInfoCardProps> = ({ icon, label, value, accentColor }) => (
  <div className="group relative p-5 rounded-2xl transition-all duration-300 hover:-translate-y-0.5"
    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
    <div className="flex items-start gap-4">
      <div className="p-2.5 rounded-xl flex-shrink-0"
        style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}30`, color: accentColor }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">{label}</p>
        <p className="font-semibold text-white truncate">{value}</p>
      </div>
    </div>
  </div>
);

interface StatsCardProps {
  title: string;
  value: string;
  accentColor: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, accentColor }) => (
  <div className="relative p-7 rounded-2xl transition-all duration-300 hover:-translate-y-0.5"
    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
    {/* Accent line */}
    <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
      style={{ background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)` }} />
    <p className="text-slate-500 text-xs mb-2 font-semibold uppercase tracking-wider">{title}</p>
    <p className="text-4xl font-black" style={{ color: accentColor }}>{value}</p>
  </div>
);
