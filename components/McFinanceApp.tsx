import React, { useState, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import { 
  LayoutDashboard, 
  Receipt, 
  PlusCircle, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Calendar as CalendarIcon,
  MapPin,
  CreditCard,
  Tag,
  ChevronRight,
  ArrowRight,
  Bell,
  Search,
  BarChart3,
  User,
  Wallet,
  Edit2,
  Trash2,
  X,
  RefreshCw,
  Download,
  Cloud,
  CloudOff,
  AlertCircle,
  Landmark,
  CheckCircle,
  PiggyBank
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';

// Types
type CostCenter = 'Compartilhado' | 'Individual' | 'Lunna 50%' | 'Lunna 30%';
type Category = 'Almoço' | 'Bebida' | 'Casa do Lago' | 'Combustível' | 'Esporte' | 'Farmacia' | 'Fixa' | 'Ifood' | 'Lunna' | 'Manutenção Carro' | 'Manutenção Casa' | 'Mercado' | 'Outros' | 'Saúde' | 'Velli' | 'Viagem';
type Card = 'Nubank' | 'Neon' | 'Bradesco' | 'C6Bank' | 'Pix';
type Person = 'Mccley' | 'Paula' | 'Tarcilla' | 'Jan' | 'Saulo' | 'Jorge' | 'Edielton';

interface Expense {
  id: string;
  dueDate: string;
  costCenter: CostCenter;
  installments: string;
  splitWith?: Person[];
  individualPerson?: Person;
  description: string;
  value: number;
  category: Category;
  card: Card;
  createdAt: number;
  receivedFrom?: Person[]; // Track who has already paid their share
  isRecurring?: boolean;
}

interface MonthlyRevenue {
  id: string;
  month: number;
  year: number;
  value?: number;
  salary?: number;
  commission?: number;
  dsr?: number;
  grossSalary?: number;
  netSalary?: number;
}

interface Loan {
  id: string;
  person: string;
  totalValue: number;
  installmentsTotal: number;
  installmentsPaid: number;
  monthlyValue: number;
  description: string;
  date: string;
  amountPaid?: number;
  paymentHistory?: { date: string, amount: number }[];
}

const PEOPLE: Person[] = ['Mccley', 'Paula', 'Tarcilla', 'Jan', 'Saulo', 'Jorge', 'Edielton'];
const COST_CENTERS: CostCenter[] = ['Compartilhado', 'Individual', 'Lunna 50%', 'Lunna 30%'];
const CATEGORIES: Category[] = ['Almoço', 'Bebida', 'Casa do Lago', 'Combustível', 'Esporte', 'Farmacia', 'Fixa', 'Ifood', 'Lunna', 'Manutenção Carro', 'Manutenção Casa', 'Mercado', 'Outros', 'Saúde', 'Velli', 'Viagem'];
const CARDS: Card[] = ['Nubank', 'Neon', 'Bradesco', 'C6Bank', 'Pix'];

export default function McFinanceApp() {
  const [activeTab, setActiveTab] = useState<'ledger' | 'expenses' | 'relatorio' | 'receita' | 'emprestimos'>('ledger');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenues, setRevenues] = useState<MonthlyRevenue[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [editingInstallment, setEditingInstallment] = useState<Record<string, number>>({});
  const [editingTotal, setEditingTotal] = useState<Record<string, number>>({});
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'local' | 'error'>('local');
  const isInitialLoad = useRef(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Supabase Sync Logic
  useEffect(() => {
    const fetchData = async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        setSyncStatus('local');
        return;
      }

      try {
        setIsSyncing(true);
        const { data: expData, error: expError } = await supabase.from('expenses').select('*');
        const { data: revData, error: revError } = await supabase.from('revenues').select('*');
        
        let loanData = null;
        try {
          const res = await supabase.from('loans').select('*');
          loanData = res.data;
        } catch (e) {
          // Fallback if table doesn't exist
        }

        if (expError || revError) throw expError || revError;

        if (expData) {
          const formattedExpenses = expData.map(e => ({
            id: e.id,
            dueDate: e.due_date,
            costCenter: e.cost_center,
            installments: e.installments,
            splitWith: e.split_with,
            individualPerson: e.individual_person,
            description: e.description,
            value: e.value,
            category: e.category,
            card: e.card,
            createdAt: e.created_at,
            receivedFrom: e.received_from,
            isRecurring: e.is_recurring
          }));
          setExpenses(formattedExpenses);
        }

        if (revData) {
          setRevenues(revData);
        }

        if (loanData) {
          setLoans(loanData);
        }

        setSyncStatus('synced');
      } catch (error) {
        console.error('Supabase fetch error:', error);
        setSyncStatus('error');
      } finally {
        setIsSyncing(false);
        isInitialLoad.current = false;
      }
    };

    fetchData();
  }, []);

  // Sync expenses to Supabase
  useEffect(() => {
    if (isInitialLoad.current || syncStatus === 'local') return;

    const syncExpenses = async () => {
      try {
        const formattedExpenses = expenses.map(e => ({
          id: e.id,
          due_date: e.dueDate,
          cost_center: e.costCenter,
          installments: e.installments,
          split_with: e.splitWith,
          individual_person: e.individualPerson,
          description: e.description,
          value: e.value,
          category: e.category,
          card: e.card,
          created_at: e.createdAt,
          received_from: e.receivedFrom,
          is_recurring: e.isRecurring
        }));

        // Simple approach: delete all and re-insert or upsert
        // For small datasets, upsert is fine
        const { error } = await supabase.from('expenses').upsert(formattedExpenses);
        if (error) throw error;
        setSyncStatus('synced');
      } catch (error) {
        console.error('Supabase sync error (expenses):', error);
        setSyncStatus('error');
      }
    };

    const timeout = setTimeout(syncExpenses, 1000);
    return () => clearTimeout(timeout);
  }, [expenses, syncStatus]);

  // Sync revenues to Supabase
  useEffect(() => {
    if (isInitialLoad.current || syncStatus === 'local') return;

    const syncRevenues = async () => {
      try {
        const { error } = await supabase.from('revenues').upsert(revenues);
        if (error) throw error;
        setSyncStatus('synced');
      } catch (error) {
        console.error('Supabase sync error (revenues):', error);
        setSyncStatus('error');
      }
    };

    const timeout = setTimeout(syncRevenues, 1000);
    return () => clearTimeout(timeout);
  }, [revenues, syncStatus]);

  // Sync loans to Supabase
  useEffect(() => {
    if (isInitialLoad.current || syncStatus === 'local') return;

    const syncLoans = async () => {
      try {
        const { error } = await supabase.from('loans').upsert(loans);
        if (error) throw error;
      } catch (error) {
        console.error('Supabase sync error (loans):', error);
      }
    };

    const timeout = setTimeout(syncLoans, 1000);
    return () => clearTimeout(timeout);
  }, [loans, syncStatus]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Filter State for Reports
  const [reportFilters, setReportFilters] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    category: 'Todas',
    costCenter: 'Todos',
    person: 'Todos'
  });

  // Form State
  const initialFormState: Partial<Expense> = {
    dueDate: new Date().toISOString().split('T')[0],
    costCenter: 'Individual',
    installments: 'À vista',
    splitWith: [],
    individualPerson: 'Mccley',
    description: '',
    value: 0,
    category: 'Fixa',
    card: 'Pix',
    isRecurring: false
  };

  const [formData, setFormData] = useState<Partial<Expense>>(initialFormState);

  // Revenue Form State
  const [revenueFormData, setRevenueFormData] = useState({
    month: new Date().getMonth(),
    year: Math.max(2025, new Date().getFullYear()),
    salary: 0,
    commission: 0,
    dsr: 0,
    netSalary: 0
  });

  const getRevenueAverages = () => {
    if (revenues.length === 0) return { salary: 0, commission: 0, dsr: 0, grossSalary: 0 };
    const sorted = [...revenues].sort((a, b) => (b.year - a.year) || (b.month - a.month)).slice(0, 12);
    let sumSal = 0, sumCom = 0, sumDsr = 0, sumGross = 0;
    sorted.forEach(r => {
      sumSal += r.salary || 0;
      sumCom += r.commission || 0;
      sumDsr += r.dsr || 0;
      sumGross += r.grossSalary || (r.value || 0);
    });
    const count = sorted.length;
    return {
      salary: sumSal / count,
      commission: sumCom / count,
      dsr: sumDsr / count,
      grossSalary: sumGross / count
    };
  };
  const revenueAverages = getRevenueAverages();

  // Loan Form State
  const initialLoanFormState: Partial<Loan> = {
    person: '',
    totalValue: 0,
    installmentsTotal: 1,
    installmentsPaid: 0,
    monthlyValue: 0,
    description: '',
    date: new Date().toISOString().split('T')[0]
  };
  const [loanFormData, setLoanFormData] = useState<Partial<Loan>>(initialLoanFormState);


  // Calculations
  const totals = useMemo(() => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const totalRevenue = 142850.00; // Mock value from image
    
    let mccleyTotalExpenses = 0;
    let currentMonthMccleyExpenses = 0;
    const mccleyExpensesByCard: Record<Card, number> = {
      'Nubank': 0, 'Neon': 0, 'Bradesco': 0, 'C6Bank': 0, 'Pix': 0
    };

    // Detailed receivables for the current month
    const pendingReceivables: { expenseId: string, person: Person, amount: number, description: string }[] = [];
    const perPersonToReceive: Record<Person, number> = {
      'Mccley': 0, 'Paula': 0, 'Tarcilla': 0, 'Jan': 0, 'Saulo': 0, 'Jorge': 0, 'Edielton': 0
    };

    expenses.forEach(exp => {
      const expDate = new Date(exp.dueDate);
      const isCurrentMonth = expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;

      let mccleyShare = 0;

      if (exp.costCenter === 'Compartilhado' && exp.splitWith) {
        const includesMccley = exp.splitWith.includes('Mccley');
        const divisor = includesMccley ? exp.splitWith.length : exp.splitWith.length + 1;
        const share = exp.value / divisor;
        
        mccleyShare = share; // Mccley always takes one share in shared

        exp.splitWith.forEach(person => {
          if (person !== 'Mccley') {
            perPersonToReceive[person] += share;
            if (isCurrentMonth && !exp.receivedFrom?.includes(person)) {
              pendingReceivables.push({ expenseId: exp.id, person, amount: share, description: exp.description });
            }
          }
        });
      } else if (exp.costCenter === 'Individual' && exp.individualPerson) {
        if (exp.individualPerson === 'Mccley') {
          mccleyShare = exp.value;
        } else {
          perPersonToReceive[exp.individualPerson] += exp.value;
          if (isCurrentMonth && !exp.receivedFrom?.includes(exp.individualPerson)) {
            pendingReceivables.push({ expenseId: exp.id, person: exp.individualPerson, amount: exp.value, description: exp.description });
          }
        }
      } else if (exp.costCenter === 'Lunna 50%') {
        const share = exp.value * 0.5;
        mccleyShare = share;
        perPersonToReceive['Tarcilla'] += share;
        if (isCurrentMonth && !exp.receivedFrom?.includes('Tarcilla')) {
          pendingReceivables.push({ expenseId: exp.id, person: 'Tarcilla', amount: share, description: `${exp.description} (50%)` });
        }
      } else if (exp.costCenter === 'Lunna 30%') {
        mccleyShare = exp.value * 0.7;
        const share = exp.value * 0.3;
        perPersonToReceive['Tarcilla'] += share;
        if (isCurrentMonth && !exp.receivedFrom?.includes('Tarcilla')) {
          pendingReceivables.push({ expenseId: exp.id, person: 'Tarcilla', amount: share, description: `${exp.description} (30%)` });
        }
      }

      mccleyTotalExpenses += mccleyShare;
      if (isCurrentMonth) {
        currentMonthMccleyExpenses += mccleyShare;
      }
      if (mccleyShare > 0) {
        mccleyExpensesByCard[exp.card] += mccleyShare;
      }
    });

    const totalToReceive = Object.values(perPersonToReceive).reduce((a, b) => a + b, 0);
    const currentMonthToReceive = pendingReceivables.reduce((acc, curr) => acc + curr.amount, 0);

    const currentMonthRevenue = revenues.find(r => r.month === currentMonth && r.year === currentYear)?.value || 0;

    // Future expenses for Mccley (current year, months > currentMonth)
    const futureExpensesData: { month: string, value: number }[] = [];
    const monthNamesShort = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    
    for (let m = currentMonth + 1; m < 12; m++) {
      let monthlyMccleyTotal = 0;
      expenses.forEach(exp => {
        const expDate = new Date(exp.dueDate);
        if (expDate.getMonth() === m && expDate.getFullYear() === currentYear) {
          let mccleyShare = 0;
          if (exp.costCenter === 'Compartilhado' && exp.splitWith) {
            const includesMccley = exp.splitWith.includes('Mccley');
            const divisor = includesMccley ? exp.splitWith.length : exp.splitWith.length + 1;
            mccleyShare = exp.value / divisor;
          } else if (exp.costCenter === 'Individual' && exp.individualPerson === 'Mccley') {
            mccleyShare = exp.value;
          } else if (exp.costCenter === 'Lunna 50%') {
            mccleyShare = exp.value * 0.5;
          } else if (exp.costCenter === 'Lunna 30%') {
            mccleyShare = exp.value * 0.7;
          }
          monthlyMccleyTotal += mccleyShare;
        }
      });
      futureExpensesData.push({ month: monthNamesShort[m], value: monthlyMccleyTotal });
    }

    // Filtered expenses for the report
    const filteredExpenses = expenses.filter(exp => {
      const expDate = new Date(exp.dueDate);
      const matchesMonth = expDate.getMonth() === reportFilters.month && expDate.getFullYear() === reportFilters.year;
      const matchesCategory = reportFilters.category === 'Todas' || exp.category === reportFilters.category;
      const matchesCostCenter = reportFilters.costCenter === 'Todos' || exp.costCenter === reportFilters.costCenter;
      const matchesPerson = reportFilters.person === 'Todos' || 
        (exp.costCenter === 'Individual' && exp.individualPerson === reportFilters.person) ||
        (exp.costCenter === 'Compartilhado' && exp.splitWith?.includes(reportFilters.person as Person));

      return matchesMonth && matchesCategory && matchesCostCenter && matchesPerson;
    });

    const reportTotal = filteredExpenses.reduce((acc, curr) => acc + curr.value, 0);

    const mccleyReportTotal = filteredExpenses.reduce((acc, exp) => {
      let mccleyShare = 0;
      if (exp.costCenter === 'Compartilhado' && exp.splitWith) {
        const includesMccley = exp.splitWith.includes('Mccley');
        const divisor = includesMccley ? exp.splitWith.length : exp.splitWith.length + 1;
        mccleyShare = exp.value / divisor;
      } else if (exp.costCenter === 'Individual' && exp.individualPerson === 'Mccley') {
        mccleyShare = exp.value;
      } else if (exp.costCenter === 'Lunna 50%') {
        mccleyShare = exp.value * 0.5;
      } else if (exp.costCenter === 'Lunna 30%') {
        mccleyShare = exp.value * 0.7;
      }
      return acc + mccleyShare;
    }, 0);

    const reportRevenue = revenues.find(r => r.month === reportFilters.month && r.year === reportFilters.year)?.netSalary || 
                          revenues.find(r => r.month === reportFilters.month && r.year === reportFilters.year)?.value || 0;

    const reportByCategory = filteredExpenses.reduce((acc, exp) => {
      acc[exp.category] = (acc[exp.category] || 0) + exp.value;
      return acc;
    }, {} as Record<string, number>);

    return {
      mccleyTotalExpenses,
      currentMonthMccleyExpenses,
      mccleyExpensesByCard,
      totalToReceive,
      currentMonthToReceive,
      perPersonToReceive,
      pendingReceivables,
      currentMonthRevenue,
      futureExpensesData,
      filteredExpenses,
      reportTotal,
      mccleyReportTotal,
      reportRevenue,
      reportByCategory
    };
  }, [expenses, reportFilters, revenues]);

  const handleToggleReceived = (expenseId: string, person: Person) => {
    setExpenses(prev => prev.map(exp => {
      if (exp.id === expenseId) {
        const receivedFrom = exp.receivedFrom || [];
        if (receivedFrom.includes(person)) {
          return { ...exp, receivedFrom: receivedFrom.filter(p => p !== person) };
        } else {
          return { ...exp, receivedFrom: [...receivedFrom, person] };
        }
      }
      return exp;
    }));
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.setTextColor(16, 185, 129); // #10B981 (Emerald)
    doc.text('Relatório Financeiro - Mc Finance', 14, 22);
    
    // Subtitle with filters
    doc.setFontSize(10);
    doc.setTextColor(100);
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const filterText = `Filtros: ${monthNames[reportFilters.month]}/${reportFilters.year} | Categoria: ${reportFilters.category} | Centro de Custo: ${reportFilters.costCenter} | Pessoa: ${reportFilters.person}`;
    doc.text(filterText, 14, 30);
    
    // Summary
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Total Filtrado: R$ ${totals.reportTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 40);
    doc.text(`Despesas Mccley: R$ ${totals.mccleyReportTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 46);
    doc.text(`Receita Líquida: R$ ${totals.reportRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 52);
    
    const balance = totals.reportRevenue - totals.mccleyReportTotal;
    doc.setFontSize(14);
    if (balance >= 0) {
      doc.setTextColor(16, 185, 129); // Green
    } else {
      doc.setTextColor(239, 68, 68); // Red
    }
    doc.text(`Saldo do Mês (Mccley): R$ ${balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 60);

    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(`Quantidade de Lançamentos: ${totals.filteredExpenses.length}`, 14, 68);

    // Table
    const tableColumn = ['Descrição', 'Vencimento', 'Centro de Custo', 'Valor (R$)', 'Categoria', 'Cartão'];
    const tableRows = totals.filteredExpenses.map(exp => [
      exp.description,
      new Date(exp.dueDate).toLocaleDateString('pt-BR'),
      exp.costCenter,
      exp.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      exp.category,
      exp.card
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 75,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 75 },
    });

    doc.save(`relatorio_financeiro_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingId) {
      setExpenses(expenses.map(exp => 
        exp.id === editingId ? { ...exp, ...formData as Expense } : exp
      ));
      setEditingId(null);
    } else if (formData.isRecurring) {
      const baseDate = new Date(formData.dueDate || '');
      const year = baseDate.getFullYear();
      const startMonth = baseDate.getMonth();
      const newEntries: Expense[] = [];
      
      for (let m = startMonth; m <= 11; m++) {
        const d = new Date(year, m, baseDate.getDate());
        // Handle month overflow (e.g. Jan 31 -> Feb 28/29)
        if (d.getMonth() !== m) {
          d.setDate(0);
        }
        
        newEntries.push({
          ...formData as Expense,
          id: Math.random().toString(36).substr(2, 9),
          dueDate: d.toISOString().split('T')[0],
          createdAt: Date.now()
        });
      }
      setExpenses([...newEntries, ...expenses]);
    } else {
      const newExpense: Expense = {
        ...formData as Expense,
        id: Math.random().toString(36).substr(2, 9),
        createdAt: Date.now()
      };
      setExpenses([newExpense, ...expenses]);
    }

    setShowForm(false);
    setActiveTab('ledger');
    setFormData(initialFormState);
  };

  const handleEdit = (expense: Expense) => {
    setFormData(expense);
    setEditingId(expense.id);
    setActiveTab('expenses');
  };

  const handleDelete = (id: string) => {
    setExpenses(expenses.filter(exp => exp.id !== id));
    setShowDeleteConfirm(null);
  };

  const togglePersonInSplit = (person: Person) => {
    const current = formData.splitWith || [];
    if (current.includes(person)) {
      setFormData({ ...formData, splitWith: current.filter(p => p !== person) });
    } else {
      setFormData({ ...formData, splitWith: [...current, person] });
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans pb-24 relative overflow-hidden">
      {/* Background Glow Effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#10B981]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="px-6 py-6 flex justify-between items-center">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#10B981] rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Mc Finance</h1>
          </div>
          
          {/* Sync Status Indicator */}
          <div className="flex items-center gap-2 mt-1">
            {syncStatus === 'synced' ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-900/20 rounded-full border border-emerald-500/20">
                <Cloud className="w-3 h-3 text-emerald-500" />
                <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Sincronizado</span>
              </div>
            ) : syncStatus === 'local' ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-900/20 rounded-full border border-amber-500/20">
                <CloudOff className="w-3 h-3 text-amber-500" />
                <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Modo Local</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-900/20 rounded-full border border-red-500/20">
                <AlertCircle className="w-3 h-3 text-red-500" />
                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Erro de Conexão</span>
              </div>
            )}
            {isSyncing && (
              <RefreshCw className="w-2.5 h-2.5 text-gray-500 animate-spin" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-gray-400 hover:text-white transition-colors">
            <Bell className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-800 relative">
            <Image 
              src="https://picsum.photos/seed/user/100/100" 
              alt="Usuário" 
              fill 
              className="object-cover" 
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </header>

      <main className="px-6 space-y-8">
        {activeTab === 'ledger' ? (
          <div className="space-y-8">
            {/* Revenue/Expenses Grid */}
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="bg-[#171717] p-6 rounded-2xl border border-white/5">
                <p className="text-[10px] uppercase tracking-widest font-bold text-[#10B981] mb-4">Receita</p>
                <p className="text-2xl font-bold">R$ {totals.currentMonthRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-[#171717] p-6 rounded-2xl border border-white/5">
                <p className="text-[10px] uppercase tracking-widest font-bold text-red-500 mb-4">Despesa Total</p>
                <p className="text-2xl font-bold">R$ {totals.currentMonthMccleyExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Values to Receive Section */}
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <h3 className="text-2xl font-bold">Valores a Receber</h3>
                  <p className="text-sm text-gray-500">Recebíveis pendentes do mês em exercício</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Total Pendente</p>
                  <p className="text-2xl font-bold text-[#10B981]">
                    R$ {totals.currentMonthToReceive.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* All Pending Receivables List */}
              <div className="space-y-4">
                {totals.pendingReceivables.length === 0 ? (
                  <div className="bg-[#171717] p-8 rounded-3xl border border-white/5 text-center text-gray-600">
                    Nenhum recebível pendente para este mês.
                  </div>
                ) : (
                  totals.pendingReceivables.map((item, idx) => (
                    <div key={`${item.expenseId}-${item.person}-${idx}`} className="bg-[#171717] p-6 rounded-2xl border border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded border-gray-700 bg-transparent text-[#10B981] focus:ring-[#10B981]"
                          onChange={() => handleToggleReceived(item.expenseId, item.person)}
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-200">{item.person}</span>
                            <span className="text-[10px] text-gray-500 uppercase tracking-tighter">({item.description})</span>
                          </div>
                          <p className="text-xl font-bold text-red-500">
                            R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-700" />
                    </div>
                  ))
                )}
              </div>
            </div>

              {/* Mccley Payment Method Detailing */}
              <div className="bg-[#171717] rounded-3xl p-6 border border-white/5 space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold">Gastos por Pagamento (Mccley)</h4>
                  <CreditCard className="w-5 h-5 text-gray-600" />
                </div>
                <div className="space-y-4">
                  {Object.entries(totals.mccleyExpensesByCard)
                    .filter(([_, value]) => value > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([card, value]) => (
                    <div key={card} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#262626] rounded-lg flex items-center justify-center">
                          <span className="text-[10px] font-bold text-gray-400">{card[0]}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-300">{card}</span>
                      </div>
                      <p className="font-bold text-sm">
                        R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                  {Object.values(totals.mccleyExpensesByCard).every(v => v === 0) && (
                    <p className="text-center text-gray-600 text-sm py-4">Nenhum gasto registrado para Mccley.</p>
                  )}
                </div>
              </div>

              {/* Future Expenses Chart */}
              <div className="bg-[#171717] rounded-3xl p-6 border border-white/5 space-y-6">
                <h4 className="font-bold">Despesa Futura</h4>
                <div className="flex items-end justify-between h-32 gap-2 px-2">
                  {totals.futureExpensesData.length > 0 ? (
                    totals.futureExpensesData.map((bar) => {
                      const maxVal = Math.max(...totals.futureExpensesData.map(d => d.value), 1);
                      const height = `${(bar.value / maxVal) * 100}%`;
                      return (
                        <div key={bar.month} className="flex-1 flex flex-col items-center gap-4">
                          <div 
                            className="w-full rounded-lg transition-all duration-500 bg-[#1E2923] relative group"
                            style={{ height: height }}
                          >
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[8px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                              R$ {bar.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-[#10B981] to-[#6EE7B7] rounded-lg opacity-40" />
                          </div>
                          <span className="text-[10px] font-bold text-gray-600">{bar.month}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                      Nenhuma despesa futura registrada para este ano.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'expenses' ? (
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h2 className="text-4xl font-bold">{editingId ? 'Editar Despesa' : 'Lançar Despesa'}</h2>
                {editingId && (
                  <button 
                    onClick={() => {
                      setEditingId(null);
                      setFormData(initialFormState);
                      setActiveTab('ledger');
                    }}
                    className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-white"
                  >
                    <X className="w-6 h-6" />
                  </button>
                )}
              </div>
              <p className="text-gray-500 text-sm">
                {editingId ? 'Atualize os detalhes da transação no livro caixa.' : 'Insira os detalhes da nova transação no livro caixa.'}
              </p>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-6 pb-12">
              {/* Amount Card */}
              <div className="bg-[#171717] p-8 rounded-3xl border border-white/5 space-y-4">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#10B981]">Valor da Transação</p>
                <div className="flex items-baseline gap-4">
                  <span className="text-3xl font-bold text-gray-600">R$</span>
                  <input 
                    type="number" 
                    step="0.01"
                    placeholder="0,00"
                    className="bg-transparent text-6xl font-bold outline-none w-full placeholder:text-gray-800"
                    value={formData.value || ''}
                    onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) })}
                    required
                  />
                </div>
              </div>

              {/* Cost Center Card */}
              <div className="bg-[#171717] p-6 rounded-3xl border border-white/5 space-y-4">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Centro de Custo</p>
                <select 
                  className="w-full bg-[#262626] border-none rounded-xl p-4 text-gray-300 outline-none appearance-none"
                  value={formData.costCenter}
                  onChange={(e) => setFormData({ ...formData, costCenter: e.target.value as CostCenter })}
                >
                  {COST_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Installments Card */}
              <div className="bg-[#171717] p-6 rounded-3xl border border-white/5 space-y-4">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Parcelamento</p>
                <select 
                  className="w-full bg-[#262626] border-none rounded-xl p-4 text-gray-300 outline-none appearance-none"
                  value={formData.installments}
                  onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                >
                  <option value="À vista">À vista</option>
                  {[...Array(12)].map((_, i) => (
                    <option key={i} value={`${i + 1}x`}>{i + 1}x</option>
                  ))}
                </select>
              </div>

              {/* Recurring Toggle */}
              <div className="bg-[#171717] p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-900/20 rounded-xl flex items-center justify-center">
                    <RefreshCw className={`w-5 h-5 ${formData.isRecurring ? 'text-blue-400' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Despesa Recorrente</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-tight">Repetir até o fim do ano</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setFormData({ ...formData, isRecurring: !formData.isRecurring })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${formData.isRecurring ? 'bg-[#10B981]' : 'bg-gray-800'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.isRecurring ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {/* Category Card */}
              <div className="bg-[#171717] p-6 rounded-3xl border border-white/5 space-y-4">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Categoria</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: c })}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                        formData.category === c 
                          ? 'bg-[#064E3B] text-[#10B981] border-[#10B981]' 
                          : 'bg-[#262626] text-gray-400 border-transparent hover:bg-[#333333]'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Debtor Card (Conditional) */}
              {(formData.costCenter === 'Compartilhado' || formData.costCenter === 'Individual') && (
                <div className="bg-[#171717] p-6 rounded-3xl border border-white/5 space-y-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">
                    {formData.costCenter === 'Compartilhado' ? 'Dividir com (Mccley já incluso)' : 'Atribuir a'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PEOPLE.filter(p => formData.costCenter === 'Compartilhado' ? p !== 'Mccley' : true).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          if (formData.costCenter === 'Individual') {
                            setFormData({ ...formData, individualPerson: p });
                          } else {
                            togglePersonInSplit(p);
                          }
                        }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                          (formData.individualPerson === p || formData.splitWith?.includes(p))
                            ? 'bg-[#064E3B] text-[#10B981] border-[#10B981]' 
                            : 'bg-[#262626] text-gray-400 border-transparent'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date Card */}
              <div className="bg-[#171717] p-6 rounded-3xl border border-white/5 space-y-4">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Vencimento</p>
                <div className="relative">
                  <input 
                    type="date" 
                    className="w-full bg-[#262626] border-none rounded-xl p-4 text-gray-300 outline-none"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Description Card */}
              <div className="bg-[#171717] p-6 rounded-3xl border border-white/5 space-y-4">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Descrição</p>
                <div className="relative">
                  <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                  <input 
                    type="text" 
                    placeholder="O que você comprou?"
                    className="w-full bg-[#262626] border-none rounded-xl p-4 pl-12 text-gray-300 outline-none placeholder:text-gray-600"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Payment Method Card */}
              <div className="bg-[#171717] p-6 rounded-3xl border border-white/5 space-y-4">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Método de Pagamento</p>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {CARDS.map(card => (
                    <button
                      key={card}
                      type="button"
                      onClick={() => setFormData({ ...formData, card })}
                      className={`flex-shrink-0 w-40 p-4 rounded-2xl border transition-all space-y-4 text-left ${
                        formData.card === card 
                          ? 'bg-[#064E3B]/20 border-[#10B981] text-[#10B981]' 
                          : 'bg-[#262626] border-transparent text-gray-500'
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase">{card}</p>
                      <CreditCard className="w-6 h-6" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-[#10B981] to-[#059669] text-black py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 active:scale-95 transition-transform"
              >
                {editingId ? 'Salvar Alterações' : 'Confirmar Transação'} <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </div>
        ) : activeTab === 'relatorio' ? (
          <div className="space-y-8">
            <div className="space-y-2">
              <h2 className="text-4xl font-bold">Relatório</h2>
              <p className="text-gray-500 text-sm">Detalhamento e filtros de despesas.</p>
            </div>

            {/* Filters */}
            <div className="bg-[#171717] p-6 rounded-3xl border border-white/5 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Mês</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-sm text-gray-300 outline-none"
                    value={reportFilters.month}
                    onChange={(e) => setReportFilters({ ...reportFilters, month: parseInt(e.target.value) })}
                  >
                    {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                      <option key={m} value={i}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Ano</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-sm text-gray-300 outline-none"
                    value={reportFilters.year}
                    onChange={(e) => setReportFilters({ ...reportFilters, year: parseInt(e.target.value) })}
                  >
                    {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Categoria</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-sm text-gray-300 outline-none"
                    value={reportFilters.category}
                    onChange={(e) => setReportFilters({ ...reportFilters, category: e.target.value })}
                  >
                    <option value="Todas">Todas</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Centro de Custo</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-sm text-gray-300 outline-none"
                    value={reportFilters.costCenter}
                    onChange={(e) => setReportFilters({ ...reportFilters, costCenter: e.target.value })}
                  >
                    <option value="Todos">Todos</option>
                    {COST_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Pessoa</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-sm text-gray-300 outline-none"
                    value={reportFilters.person}
                    onChange={(e) => setReportFilters({ ...reportFilters, person: e.target.value })}
                  >
                    <option value="Todos">Todos</option>
                    {PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Dashboard Visual */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Balance Summary Card */}
              <div className={`p-8 rounded-3xl text-white shadow-lg relative overflow-hidden flex flex-col justify-between ${totals.reportRevenue - totals.mccleyReportTotal >= 0 ? 'bg-gradient-to-br from-[#10B981] to-[#059669] shadow-emerald-900/20' : 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-900/20'}`}>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-70 mb-1">Mccley - Saldo do Mês</p>
                      <h3 className="text-4xl font-bold">
                        R$ {(totals.reportRevenue - totals.mccleyReportTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </h3>
                    </div>
                    <button 
                      onClick={exportToPDF}
                      className="flex items-center gap-2 bg-black/20 hover:bg-black/40 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors backdrop-blur-sm"
                    >
                      <Download className="w-4 h-4" /> PDF
                    </button>
                  </div>
                  
                  <div className="space-y-3 pt-4 border-t border-white/20">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-bold opacity-80">Receita Líquida:</span>
                      <span className="font-bold">+ R$ {totals.reportRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-bold opacity-80">Despesas (Sua parte):</span>
                      <span className="font-bold">- R$ {totals.mccleyReportTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                    </div>
                  </div>
                </div>
                <BarChart3 className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 -rotate-12" />
              </div>

              {/* Categories Chart */}
              <div className="bg-[#171717]/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white/5 space-y-6 shadow-xl">
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Top 5 Categorias</p>
                <div className="space-y-4">
                  {Object.entries(totals.reportByCategory)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 5)
                    .map(([category, value]) => {
                      const percentage = totals.reportTotal > 0 ? (value / totals.reportTotal) * 100 : 0;
                      return (
                        <div key={category} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold text-gray-300">
                            <span>{category}</span>
                            <span>R$ {value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                          </div>
                          <div className="w-full bg-[#262626] rounded-full h-2">
                            <div className="bg-[#10B981] h-2 rounded-full transition-all" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  {Object.keys(totals.reportByCategory).length === 0 && (
                    <p className="text-gray-600 text-sm italic">Nenhum gasto no período.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Detailing List */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold px-2">Detalhamento</h3>
              {totals.filteredExpenses.length === 0 ? (
                <div className="bg-[#171717] p-12 rounded-3xl border border-white/5 text-center text-gray-600">
                  Nenhuma despesa encontrada para os filtros aplicados.
                </div>
              ) : (
                totals.filteredExpenses.map((exp) => (
                  <div key={exp.id} className="bg-[#171717] p-6 rounded-2xl border border-white/5 flex justify-between items-center group">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${exp.category === 'Lunna' ? 'bg-purple-900/20 text-purple-400' : 'bg-emerald-900/20 text-[#10B981]'}`}>
                        <Receipt className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold">{exp.description}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-500">{new Date(exp.dueDate).toLocaleDateString('pt-BR')}</p>
                          <span className="w-1 h-1 rounded-full bg-gray-700" />
                          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{exp.costCenter}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold text-lg">R$ {exp.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">{exp.card}</p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(exp)}
                          className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-[#10B981] transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setShowDeleteConfirm(exp.id)}
                          className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'receita' ? (
          <div className="space-y-8">
            <div className="space-y-2">
              <h2 className="text-4xl font-bold">Lançar Receita</h2>
              <p className="text-gray-500 text-sm">Gerencie sua receita mensal e acompanhe as métricas.</p>
            </div>

            {/* Dashboard Média dos últimos 12 meses */}
            <div className="bg-[#171717]/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white/5 space-y-6 shadow-2xl">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Média dos últimos 12 meses</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#262626]/50 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Salário</p>
                  <p className="font-bold text-lg text-white">R$ {revenueAverages.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-[#262626]/50 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Comissão</p>
                  <p className="font-bold text-lg text-white">R$ {revenueAverages.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-[#262626]/50 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">DSR</p>
                  <p className="font-bold text-lg text-white">R$ {revenueAverages.dsr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-emerald-900/10 p-4 rounded-2xl border border-emerald-500/20 shadow-inner">
                  <p className="text-xs text-emerald-500 uppercase tracking-wider font-bold mb-1">Salário Bruto</p>
                  <p className="font-bold text-lg text-[#10B981]">R$ {revenueAverages.grossSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#171717] p-8 rounded-[2rem] border border-white/5 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Mês</p>
                  <select 
                    value={revenueFormData.month}
                    onChange={(e) => setRevenueFormData({ ...revenueFormData, month: parseInt(e.target.value) })}
                    className="w-full bg-[#262626] border-none rounded-xl p-4 text-gray-300 outline-none appearance-none"
                  >
                    {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                      <option key={m} value={i}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Ano</p>
                  <select 
                    value={revenueFormData.year}
                    onChange={(e) => setRevenueFormData({ ...revenueFormData, year: parseInt(e.target.value) })}
                    className="w-full bg-[#262626] border-none rounded-xl p-4 text-gray-300 outline-none appearance-none"
                  >
                    {[2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">Salário</p>
                  <div className="flex items-center gap-2 bg-[#262626] rounded-xl p-4 focus-within:border-white/20 border border-transparent transition-colors">
                    <span className="text-gray-500 font-bold">R$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="0,00"
                      value={revenueFormData.salary || ''}
                      onChange={e => setRevenueFormData({...revenueFormData, salary: parseFloat(e.target.value) || 0})}
                      className="bg-transparent text-white outline-none w-full"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">Comissão</p>
                  <div className="flex items-center gap-2 bg-[#262626] rounded-xl p-4 focus-within:border-white/20 border border-transparent transition-colors">
                    <span className="text-gray-500 font-bold">R$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="0,00"
                      value={revenueFormData.commission || ''}
                      onChange={e => setRevenueFormData({...revenueFormData, commission: parseFloat(e.target.value) || 0})}
                      className="bg-transparent text-white outline-none w-full"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">DSR</p>
                  <div className="flex items-center gap-2 bg-[#262626] rounded-xl p-4 focus-within:border-white/20 border border-transparent transition-colors">
                    <span className="text-gray-500 font-bold">R$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="0,00"
                      value={revenueFormData.dsr || ''}
                      onChange={e => setRevenueFormData({...revenueFormData, dsr: parseFloat(e.target.value) || 0})}
                      className="bg-transparent text-white outline-none w-full"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#10B981]">Salário Líquido</p>
                  <div className="flex items-center gap-2 bg-[#064E3B]/20 rounded-xl p-4 border border-[#10B981]/20 focus-within:border-[#10B981] transition-colors">
                    <span className="text-[#10B981] font-bold">R$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="0,00"
                      value={revenueFormData.netSalary || ''}
                      onChange={e => setRevenueFormData({...revenueFormData, netSalary: parseFloat(e.target.value) || 0})}
                      className="bg-transparent text-[#10B981] font-bold outline-none w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#262626]/50 p-5 rounded-2xl flex justify-between items-center border border-white/5 border-dashed">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Salário Bruto Projetado</p>
                <p className="text-xl font-bold text-white">
                  R$ {(revenueFormData.salary + revenueFormData.commission + revenueFormData.dsr).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <button 
                onClick={() => {
                  const grossSalary = revenueFormData.salary + revenueFormData.commission + revenueFormData.dsr;
                  const newRevenue: MonthlyRevenue = {
                    id: Math.random().toString(36).substr(2, 9),
                    month: revenueFormData.month,
                    year: revenueFormData.year,
                    salary: revenueFormData.salary,
                    commission: revenueFormData.commission,
                    dsr: revenueFormData.dsr,
                    grossSalary,
                    netSalary: revenueFormData.netSalary,
                    value: revenueFormData.netSalary // Mantém o value com o líquido para compatibilidade antiga
                  };
                  
                  const existingIdx = revenues.findIndex(r => r.month === newRevenue.month && r.year === newRevenue.year);
                  if (existingIdx >= 0) {
                    const newRevenues = [...revenues];
                    newRevenues[existingIdx] = { ...newRevenues[existingIdx], ...newRevenue };
                    setRevenues(newRevenues);
                  } else {
                    setRevenues([...revenues, newRevenue]);
                  }
                  
                  setRevenueFormData({
                    ...revenueFormData,
                    salary: 0,
                    commission: 0,
                    dsr: 0,
                    netSalary: 0
                  });
                }}
                className="w-full bg-gradient-to-r from-[#10B981] to-[#059669] text-black py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 active:scale-95 transition-transform"
              >
                Salvar Lançamento <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold px-2">Histórico de Receitas</h3>
              <div className="space-y-4">
                {revenues.sort((a, b) => b.year - a.year || b.month - a.month).map(r => (
                  <div key={r.id} className="bg-[#171717]/80 backdrop-blur-xl p-6 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-xl">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg text-white">{['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][r.month]} {r.year}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 text-xs text-gray-400">
                          <span className="bg-[#262626] px-2 py-1 rounded-md text-gray-300">Bruto: R$ {(r.grossSalary || r.value || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                          {r.salary !== undefined && <span className="px-2 py-1">Salário: R$ {r.salary.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>}
                          {r.commission !== undefined && <span className="px-2 py-1">Comissão: R$ {r.commission.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>}
                          {r.dsr !== undefined && <span className="px-2 py-1">DSR: R$ {r.dsr.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] uppercase text-[#10B981] font-bold tracking-widest mb-1">Líquido Recebido</p>
                          <p className="font-bold text-2xl text-[#10B981]">R$ {(r.netSalary || r.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <button onClick={() => setRevenues(revenues.filter(rev => rev.id !== r.id))} className="text-red-500 p-3 hover:bg-red-500/10 rounded-xl transition-colors self-center">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'emprestimos' ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="space-y-2">
              <h2 className="text-4xl font-bold">Empréstimos</h2>
              <p className="text-gray-500 text-sm">Gerencie valores emprestados e recebimentos parcelados.</p>
            </div>

            {/* Novo Empréstimo */}
            <div className="bg-[#171717]/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl space-y-6 relative z-10">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <PiggyBank className="w-5 h-5 text-[#10B981]" />
                Registrar Novo Empréstimo
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Para quem?</label>
                  <input 
                    type="text" 
                    placeholder="Nome da pessoa"
                    className="w-full bg-[#262626] border border-white/5 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/50 transition-all"
                    value={loanFormData.person}
                    onChange={e => setLoanFormData({...loanFormData, person: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Descrição</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Empréstimo carro"
                    className="w-full bg-[#262626] border border-white/5 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/50 transition-all"
                    value={loanFormData.description}
                    onChange={e => setLoanFormData({...loanFormData, description: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Valor Total (R$)</label>
                  <input 
                    type="number"
                    step="0.01" 
                    placeholder="0.00"
                    className="w-full bg-[#262626] border border-white/5 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/50 transition-all"
                    value={loanFormData.totalValue || ''}
                    onChange={e => {
                      const total = parseFloat(e.target.value);
                      const installments = loanFormData.installmentsTotal || 1;
                      setLoanFormData({
                        ...loanFormData, 
                        totalValue: total,
                        monthlyValue: total / installments
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Qtd Parcelas</label>
                  <input 
                    type="number"
                    min="1"
                    className="w-full bg-[#262626] border border-white/5 rounded-2xl py-4 px-4 text-white focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/50 transition-all"
                    value={loanFormData.installmentsTotal || ''}
                    onChange={e => {
                      const installments = parseInt(e.target.value) || 1;
                      const total = loanFormData.totalValue || 0;
                      setLoanFormData({
                        ...loanFormData, 
                        installmentsTotal: installments,
                        monthlyValue: total / installments
                      });
                    }}
                  />
                </div>
              </div>

              {loanFormData.totalValue && loanFormData.installmentsTotal ? (
                <div className="p-4 bg-emerald-900/20 rounded-2xl border border-emerald-500/20 flex items-center justify-between">
                  <span className="text-emerald-500 text-sm font-medium">Valor por Parcela:</span>
                  <span className="text-xl font-bold text-emerald-400">R$ {(loanFormData.totalValue / loanFormData.installmentsTotal).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                </div>
              ) : null}

              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (loanFormData.person && loanFormData.totalValue && loanFormData.installmentsTotal) {
                    const newLoan: Loan = {
                      id: Math.random().toString(36).substr(2, 9),
                      person: loanFormData.person,
                      totalValue: loanFormData.totalValue,
                      installmentsTotal: loanFormData.installmentsTotal,
                      installmentsPaid: 0,
                      monthlyValue: loanFormData.totalValue / loanFormData.installmentsTotal,
                      description: loanFormData.description || 'Empréstimo',
                      date: new Date().toISOString().split('T')[0]
                    };
                    setLoans([newLoan, ...loans]);
                    setLoanFormData(initialLoanFormState);
                  }
                }}
                className="w-full bg-gradient-to-r from-[#10B981] to-[#059669] text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#10B981]/25 hover:shadow-[#10B981]/40 transition-all flex items-center justify-center gap-2"
              >
                Salvar Empréstimo <ArrowRight className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Lista de Empréstimos */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold px-2">Empréstimos Ativos</h3>
              {loans.length === 0 ? (
                <div className="text-center py-10 text-gray-500">Nenhum empréstimo registrado.</div>
              ) : (
                <div className="space-y-4 relative z-10">
                  {loans.map(loan => {
                    const amountPaid = loan.amountPaid ?? (loan.installmentsPaid * loan.monthlyValue);
                    const remainingBalance = Math.max(0, loan.totalValue - amountPaid);
                    const editingValue = editingInstallment[loan.id] !== undefined ? editingInstallment[loan.id] : loan.monthlyValue;
                    
                    return (
                    <motion.div 
                      key={loan.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-[#171717]/80 backdrop-blur-xl p-6 rounded-2xl border border-white/10 flex flex-col gap-4 shadow-xl"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-lg text-white">{loan.person}</h4>
                          <p className="text-sm text-gray-400">{loan.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Total Emprestado</p>
                          <div className="flex items-center justify-end gap-2">
                            {editingTotal[loan.id] !== undefined ? (
                              <div className="flex items-center gap-1 bg-[#262626] rounded-lg px-2 py-1 border border-white/5 focus-within:border-red-500/50">
                                <span className="text-xs font-bold text-red-400">R$</span>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  autoFocus
                                  value={editingTotal[loan.id]}
                                  onChange={e => setEditingTotal({ ...editingTotal, [loan.id]: parseFloat(e.target.value) || 0 })}
                                  onBlur={() => {
                                      setLoans(loans.map(l => l.id === loan.id ? { ...l, totalValue: editingTotal[loan.id] } : l));
                                      const newEditing = { ...editingTotal };
                                      delete newEditing[loan.id];
                                      setEditingTotal(newEditing);
                                  }}
                                  className="bg-transparent text-sm font-bold text-red-400 outline-none w-20 text-right"
                                />
                              </div>
                            ) : (
                              <>
                                <p className="font-bold text-red-400">R$ {loan.totalValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                                <button onClick={() => setEditingTotal({ ...editingTotal, [loan.id]: loan.totalValue })} className="text-gray-500 hover:text-white">
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mt-2 mb-1">Saldo Devedor</p>
                          <p className="font-bold text-[#10B981]">R$ {remainingBalance.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-gray-400 font-bold">
                          <span>Progresso: {loan.installmentsPaid} de {loan.installmentsTotal} parcelas</span>
                          <span>R$ {amountPaid.toLocaleString('pt-BR', {minimumFractionDigits:2})} recebidos</span>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full h-2 bg-[#262626] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-[#10B981] to-emerald-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, (loan.installmentsPaid / loan.installmentsTotal) * 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Próxima parcela:</span>
                          <div className="flex items-center gap-1 bg-[#262626] rounded-lg px-2 py-1 border border-white/5 focus-within:border-[#10B981]/50 focus-within:ring-1 focus-within:ring-[#10B981]/50 transition-all">
                            <span className="text-xs font-bold text-[#10B981]">R$</span>
                            <input 
                              type="number" 
                              step="0.01"
                              value={editingValue || ''}
                              onChange={e => setEditingInstallment({ ...editingInstallment, [loan.id]: parseFloat(e.target.value) || 0 })}
                              className="bg-transparent text-sm font-bold text-[#10B981] outline-none w-20"
                            />
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {loan.installmentsPaid < loan.installmentsTotal && remainingBalance > 0 ? (
                            <button 
                              onClick={() => {
                                setLoans(loans.map(l => {
                                  if (l.id === loan.id) {
                                    const newPayment = { date: new Date().toISOString(), amount: editingValue };
                                    return { 
                                      ...l, 
                                      installmentsPaid: l.installmentsPaid + 1,
                                      amountPaid: (l.amountPaid ?? (l.installmentsPaid * l.monthlyValue)) + editingValue,
                                      paymentHistory: [...(l.paymentHistory || []), newPayment]
                                    };
                                  }
                                  return l;
                                }));
                                const newEditing = { ...editingInstallment };
                                delete newEditing[loan.id];
                                setEditingInstallment(newEditing);
                              }}
                              className="px-4 py-2 bg-emerald-900/20 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:bg-emerald-900/40 transition-colors"
                            >
                              <CheckCircle className="w-4 h-4" /> Receber Parcela
                            </button>
                          ) : (
                            <span className="px-4 py-2 bg-gray-800 text-gray-400 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" /> Quitado
                            </span>
                          )}
                          <button 
                            onClick={() => setLoans(loans.filter(l => l.id !== loan.id))}
                            className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* Accordion History */}
                      <div className="border-t border-white/5 pt-4 mt-2">
                        <button 
                          onClick={() => setExpandedHistory({ ...expandedHistory, [loan.id]: !expandedHistory[loan.id] })}
                          className="flex items-center justify-between w-full text-xs font-bold text-gray-400 hover:text-white uppercase tracking-wider"
                        >
                          <span>Histórico de Recebimentos</span>
                          <ChevronRight className={`w-4 h-4 transition-transform ${expandedHistory[loan.id] ? 'rotate-90' : ''}`} />
                        </button>
                        
                        <AnimatePresence>
                          {expandedHistory[loan.id] && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-4 space-y-2">
                                {!loan.paymentHistory || loan.paymentHistory.length === 0 ? (
                                  <p className="text-xs text-gray-500 text-center py-2">Nenhum pagamento registrado.</p>
                                ) : (
                                  loan.paymentHistory.map((payment, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-[#262626]/50 p-2 rounded-lg text-sm">
                                      <span className="text-gray-400">{new Date(payment.date).toLocaleDateString('pt-BR')}</span>
                                      <span className="font-bold text-[#10B981]">R$ {payment.amount.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <User className="w-12 h-12 mb-4 opacity-20" />
            <p>Perfil em breve</p>
          </div>
        )}
      </main>

      {/* Floating Action Button for Ledger Tab */}
      {activeTab === 'ledger' && (
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData(initialFormState);
            setActiveTab('expenses');
          }}
          className="fixed right-6 bottom-28 w-14 h-14 bg-[#10B981] rounded-2xl flex items-center justify-center text-black shadow-xl shadow-emerald-900/40 active:scale-90 transition-transform z-30"
        >
          <PlusCircle className="w-8 h-8" />
        </button>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0A0A0A]/80 backdrop-blur-xl border-t border-white/5 px-6 py-4 flex justify-around items-center z-40">
        <button 
          onClick={() => setActiveTab('ledger')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'ledger' ? 'text-[#10B981]' : 'text-gray-600'}`}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Início</span>
        </button>
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData(initialFormState);
            setActiveTab('expenses');
          }}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'expenses' ? 'text-[#10B981]' : 'text-gray-600'}`}
        >
          <Receipt className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Despesas</span>
        </button>
        <button 
          onClick={() => setActiveTab('relatorio')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'relatorio' ? 'text-[#10B981]' : 'text-gray-600'}`}
        >
          <BarChart3 className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter hidden sm:inline">Relatório</span>
        </button>
        <button 
          onClick={() => setActiveTab('receita')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'receita' ? 'text-[#10B981]' : 'text-gray-600'}`}
        >
          <TrendingUp className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter hidden sm:inline">Receita</span>
        </button>
        <button 
          onClick={() => setActiveTab('emprestimos')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'emprestimos' ? 'text-[#10B981]' : 'text-gray-600'}`}
        >
          <Landmark className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter hidden sm:inline">Empréstimos</span>
        </button>
      </nav>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center px-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#171717] w-full max-w-sm p-8 rounded-3xl border border-white/5 space-y-6"
            >
              <div className="w-16 h-16 bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <div className="text-center space-y-2">
                <h4 className="text-xl font-bold">Excluir Lançamento?</h4>
                <p className="text-gray-500 text-sm">Esta ação não pode ser desfeita. O valor será removido do seu livro caixa.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="py-4 rounded-xl font-bold text-gray-400 bg-[#262626] hover:bg-[#333] transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="py-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
