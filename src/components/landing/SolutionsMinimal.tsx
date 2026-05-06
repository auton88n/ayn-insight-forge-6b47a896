import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Cpu, Zap, Users, Ticket } from 'lucide-react';

export const SolutionsMinimal = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const solutions = [
    {
      icon: Cpu,
      title: isAr ? 'وكلاء ذكاء اصطناعي' : language === 'fr' ? 'Agents IA' : 'AI Agents',
      desc: isAr ? 'مساعدين أذكياء لأعمالك' : language === 'fr' ? 'Assistants intelligents' : 'Intelligent business assistants'
    },
    {
      icon: Zap,
      title: isAr ? 'أتمتة العمليات' : language === 'fr' ? 'Automatisation' : 'Process Automation',
      desc: isAr ? 'تبسيط سير العمل الذكي' : language === 'fr' ? 'Workflows intelligents' : 'Smart workflow streamlining'
    },
    {
      icon: Users,
      title: isAr ? 'موظفي الذكاء الاصطناعي' : language === 'fr' ? 'Employés IA' : 'AI Employees',
      desc: isAr ? 'قوة عاملة رقمية متكاملة' : language === 'fr' ? 'Force de travail digitale' : 'Integrated digital workforce'
    },
    {
      icon: Ticket,
      title: isAr ? 'أنظمة التذاكر الذكية' : language === 'fr' ? 'Billetterie Intelligente' : 'Smart Ticketing',
      desc: isAr ? 'إدارة رقمية سلسة' : language === 'fr' ? 'Gestion digitale fluide' : 'Seamless digital management'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 w-full max-w-5xl mt-16 px-6">
      {solutions.map((item, i) => (
        <div key={i} className="flex flex-col items-center text-center group transition-all duration-500">
          <div className="w-12 h-12 rounded-full border border-border flex items-center justify-center mb-6 group-hover:border-foreground transition-colors duration-500">
            <item.icon size={20} className="text-muted-foreground group-hover:text-foreground transition-colors duration-500" />
          </div>
          <h3 className="text-sm font-mono uppercase tracking-[0.2em] mb-2 text-foreground">
            {item.title}
          </h3>
          <p className="text-xs text-muted-foreground font-light tracking-wide leading-relaxed">
            {item.desc}
          </p>
        </div>
      ))}
    </div>
  );
};
