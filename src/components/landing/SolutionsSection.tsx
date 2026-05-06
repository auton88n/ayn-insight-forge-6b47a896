import { memo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Bot, Cpu, Users, Ticket, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export const SolutionsSection = memo(() => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const solutions = [
    {
      slug: 'ai-agents',
      icon: Bot,
      color: 'text-blue-500',
      title: isAr ? 'وكلاء ذكاء اصطناعي' : language === 'fr' ? 'Agents IA Personnalisés' : 'Custom AI Agents',
      description: isAr ? 'مساعد ذكي يعمل ٢٤ ساعة لخدمة عملائك.' : language === 'fr' ? 'Assistants intelligents 24/7 formés sur votre entreprise.' : '24/7 intelligent assistants trained on your business.',
    },
    {
      slug: 'automation',
      icon: Cpu,
      color: 'text-emerald-500',
      title: isAr ? 'أتمتة العمليات' : language === 'fr' ? 'Automatisation des Processus' : 'Process Automation',
      description: isAr ? 'أتمتة المهام المتكررة لتوفير الوقت والجهد.' : language === 'fr' ? 'Automatisez les flux de travail pour gagner du temps.' : 'Automate workflows to save time and reduce errors.',
    },
    {
      slug: 'ai-employee',
      icon: Users,
      color: 'text-violet-500',
      title: isAr ? 'موظفين بالذكاء الاصطناعي' : language === 'fr' ? 'Employés IA' : 'AI Employees',
      description: isAr ? 'موظفين يعملون ٢٤ ساعة بدون إجازات أو تأمين صحي.' : language === 'fr' ? 'Employés qui travaillent 24h/24 sans vacances.' : 'Employees who work 24/7 with no vacations or healthcare costs.',
    },
    {
      slug: 'ticketing',
      icon: Ticket,
      color: 'text-purple-500',
      title: isAr ? 'نظام التذاكر الذكي' : language === 'fr' ? 'Billetterie Intelligente' : 'Smart Ticketing System',
      description: isAr ? 'بيع التذاكر أونلاين والتحقق بمسح QR من الجوال.' : language === 'fr' ? 'Vendez des billets en ligne et validez par scan QR.' : 'Sell tickets online and validate with phone QR scanning.',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      {solutions.map((sol) => (
        <Link
          key={sol.slug}
          to={`/solutions/${sol.slug}`}
          className="group relative p-6 bg-white border border-black/5 rounded-2xl hover:border-black/10 hover:shadow-xl transition-all duration-300 overflow-hidden"
        >
          <div className="flex items-start justify-between mb-4">
            <div className={cn("p-3 rounded-xl bg-black/5 transition-colors group-hover:bg-black/10", sol.color)}>
              <sol.icon size={24} />
            </div>
            <ArrowRight size={18} className="text-black/20 group-hover:text-black group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="text-lg font-bold mb-2 text-black">{sol.title}</h3>
          <p className="text-sm text-black/50 leading-relaxed">{sol.description}</p>
        </Link>
      ))}
    </div>
  );
});

SolutionsSection.displayName = 'SolutionsSection';
