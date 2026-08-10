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
  PiggyBank,
  Upload
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
  recurringCount?: number; // Number of times to repeat
  groupId?: string; // Para agrupar parcelas
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

// Safe Date Helper Functions to avoid UTC Timezone Shift Bugs (e.g. 2026-09-01 becoming 2026-08-31 GMT-3)
const parseDueDate = (dateStr: string) => {
  if (!dateStr) return { year: 1970, month: 0, day: 1 };
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed month (0-11)
    const day = parseInt(parts[2], 10);
    return { year, month, day };
  }
  const d = new Date(dateStr);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
};

const formatDateBR = (dateStr: string) => {
  if (!dateStr) return '';
  const { year, month, day } = parseDueDate(dateStr);
  const dd = String(day).padStart(2, '0');
  const mm = String(month + 1).padStart(2, '0');
  return `${dd}/${mm}/${year}`;
};

const getGroupId = (exp: Expense) => {
  if (exp.groupId) return exp.groupId;
  const baseDesc = exp.description.replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '').trim();
  return `retro-${baseDesc}-${exp.value}-${exp.costCenter}`;
};

const getExpensePersonShare = (exp: Expense, personFilter: string): number => {
  if (personFilter === 'Todos') return exp.value;
  const targetPerson = personFilter as Person;

  if (exp.costCenter === 'Compartilhado' && exp.splitWith) {
    const includesMccley = exp.splitWith.includes('Mccley');
    const divisor = includesMccley ? exp.splitWith.length : exp.splitWith.length + 1;
    if (targetPerson === 'Mccley') {
      return exp.value / divisor;
    } else if (exp.splitWith.includes(targetPerson)) {
      return exp.value / divisor;
    }
  } else if (exp.costCenter === 'Individual') {
    if (exp.individualPerson === targetPerson) {
      return exp.value;
    }
  } else if (exp.costCenter === 'Lunna 50%') {
    if (targetPerson === 'Mccley') return exp.value * 0.5;
    if (targetPerson === 'Tarcilla') return exp.value * 0.5;
  } else if (exp.costCenter === 'Lunna 30%') {
    if (targetPerson === 'Mccley') return exp.value * 0.7;
    if (targetPerson === 'Tarcilla') return exp.value * 0.3;
  }
  return 0;
};

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
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const isInitialLoad = useRef(true);
  const isDataLoaded = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Supabase Sync Logic
  useEffect(() => {
    const fetchData = async () => {
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
          const seenKeys = new Set<string>();
          const formattedExpenses: Expense[] = [];

          expData.forEach(e => {
            const key = `${(e.description || '').trim().toLowerCase()}|${e.due_date}|${e.value}|${e.cost_center}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              formattedExpenses.push({
                id: e.id,
                dueDate: e.due_date,
                costCenter: e.cost_center,
                installments: e.installments === 1 ? 'À vista' : `${e.installments}x`,
                splitWith: e.split_with,
                individualPerson: e.individual_person,
                description: e.description,
                value: e.value,
                category: e.category,
                card: e.card,
                createdAt: new Date(e.created_at).getTime(),
                receivedFrom: e.received_from || [],
                isRecurring: e.is_recurring,
                groupId: e.group_id
              });
            }
          });

          setExpenses(formattedExpenses);
        }

        if (revData) {
          const groupedRevenues: Record<string, MonthlyRevenue> = {};
          revData.forEach(r => {
            const key = `${r.month}-${r.year}`;
            if (!groupedRevenues[key]) {
              groupedRevenues[key] = { id: key, month: r.month, year: r.year, salary: 0, commission: 0, dsr: 0, grossSalary: 0, netSalary: 0, value: 0 };
            }
            if (r.source === 'salary') groupedRevenues[key].salary = r.amount;
            if (r.source === 'commission') groupedRevenues[key].commission = r.amount;
            if (r.source === 'dsr') groupedRevenues[key].dsr = r.amount;
            if (r.source === 'grossSalary') groupedRevenues[key].grossSalary = r.amount;
            if (r.source === 'netSalary') groupedRevenues[key].netSalary = r.amount;
            if (r.source === 'value') groupedRevenues[key].value = r.amount;
          });
          setRevenues(Object.values(groupedRevenues));
        }

        if (loanData) {
          setLoans(loanData);
        }

        isDataLoaded.current = true;
        setSyncStatus('synced');
        setSyncErrorMsg(null);
      } catch (error: any) {
        console.error('Supabase fetch error:', error);
        setSyncStatus('error');
        setSyncErrorMsg(error?.message || JSON.stringify(error));
      } finally {
        setIsSyncing(false);
        isInitialLoad.current = false;
      }
    };

    fetchData();
  }, []);

  // Targeted Helper Functions for Supabase Sync
  const saveExpensesToSupabase = async (expensesToSave: Expense[]) => {
    try {
      setIsSyncing(true);
      const rows = expensesToSave.map(e => {
        let inst = parseInt(String(e.installments).replace(/\D/g, ''), 10);
        if (isNaN(inst) || inst < 1) inst = 1;

        return {
          id: e.id,
          due_date: e.dueDate,
          cost_center: e.costCenter,
          installments: inst,
          split_with: e.splitWith || [],
          individual_person: e.individualPerson || null,
          description: e.description,
          value: Number(e.value) || 0,
          category: e.category,
          card: e.card,
          created_at: e.createdAt ? new Date(e.createdAt).toISOString() : new Date().toISOString(),
          received_from: e.receivedFrom || [],
          is_recurring: Boolean(e.isRecurring),
          group_id: e.groupId || null
        };
      });

      const { error } = await supabase.from('expenses').upsert(rows);
      if (error) throw error;
      setSyncStatus('synced');
      setSyncErrorMsg(null);
    } catch (error: any) {
      console.error('Supabase sync error (expenses):', error);
      setSyncStatus('error');
      setSyncErrorMsg(`Expenses: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteExpensesFromSupabase = async (idsToDelete: string[]) => {
    try {
      setIsSyncing(true);
      const { error } = await supabase.from('expenses').delete().in('id', idsToDelete);
      if (error) throw error;
      setSyncStatus('synced');
      setSyncErrorMsg(null);
    } catch (error: any) {
      console.error('Supabase delete error (expenses):', error);
      setSyncStatus('error');
      setSyncErrorMsg(`Expenses Delete: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveLoansToSupabase = async (loansToSave: Loan[]) => {
    try {
      setIsSyncing(true);
      const { error } = await supabase.from('loans').upsert(loansToSave);
      if (error) throw error;
      setSyncStatus('synced');
      setSyncErrorMsg(null);
    } catch (error: any) {
      console.error('Supabase sync error (loans):', error);
      setSyncStatus('error');
      setSyncErrorMsg(`Loans: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveRevenuesToSupabase = async (revenuesToSave: MonthlyRevenue[]) => {
    try {
      setIsSyncing(true);
      const rows = revenuesToSave.flatMap(r => {
        const result = [];
        if (r.salary !== undefined) result.push({ id: `rev-${r.month}-${r.year}-salary`, month: r.month, year: r.year, person: 'Mccley', source: 'salary', amount: r.salary });
        if (r.commission !== undefined) result.push({ id: `rev-${r.month}-${r.year}-commission`, month: r.month, year: r.year, person: 'Mccley', source: 'commission', amount: r.commission });
        if (r.dsr !== undefined) result.push({ id: `rev-${r.month}-${r.year}-dsr`, month: r.month, year: r.year, person: 'Mccley', source: 'dsr', amount: r.dsr });
        if (r.grossSalary !== undefined) result.push({ id: `rev-${r.month}-${r.year}-grossSalary`, month: r.month, year: r.year, person: 'Mccley', source: 'grossSalary', amount: r.grossSalary });
        if (r.netSalary !== undefined) result.push({ id: `rev-${r.month}-${r.year}-netSalary`, month: r.month, year: r.year, person: 'Mccley', source: 'netSalary', amount: r.netSalary });
        if (r.value !== undefined) result.push({ id: `rev-${r.month}-${r.year}-value`, month: r.month, year: r.year, person: 'Mccley', source: 'value', amount: r.value });
        return result;
      });
      const { error } = await supabase.from('revenues').upsert(rows);
      if (error) throw error;
      setSyncStatus('synced');
      setSyncErrorMsg(null);
    } catch (error: any) {
      console.error('Supabase sync error (revenues):', error);
      setSyncStatus('error');
      setSyncErrorMsg(`Revenues: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteRevenuesFromSupabase = async (month: number, year: number) => {
    try {
      setIsSyncing(true);
      const { error } = await supabase.from('revenues').delete().eq('month', month).eq('year', year);
      if (error) throw error;
      setSyncStatus('synced');
      setSyncErrorMsg(null);
    } catch (error: any) {
      console.error('Supabase delete error (revenues):', error);
      setSyncStatus('error');
      setSyncErrorMsg(`Revenues Delete: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteLoansFromSupabase = async (idsToDelete: string[]) => {
    try {
      setIsSyncing(true);
      const { error } = await supabase.from('loans').delete().in('id', idsToDelete);
      if (error) throw error;
      setSyncStatus('synced');
      setSyncErrorMsg(null);
    } catch (error: any) {
      console.error('Supabase delete error (loans):', error);
      setSyncStatus('error');
      setSyncErrorMsg(`Loans Delete: ${error?.message || JSON.stringify(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };


  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [applyToFuture, setApplyToFuture] = useState(false);

  // Filter State for Reports
  const [reportFilters, setReportFilters] = useState<{
    month: number | 'Todos';
    year: number | 'Todos';
    category: string;
    costCenter: string;
    person: string;
    status: string;
  }>({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    category: 'Todas',
    costCenter: 'Todos',
    person: 'Todos',
    status: 'Em Aberto' // 'Todas', 'Pagas', 'Em Aberto'
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
    isRecurring: false,
    recurringCount: 2
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

    // Detailed receivables
    type ReceivableItem = { id: string; type: 'expense' | 'loan'; amount: number; description: string; isOverdue: boolean; date: Date };
    type PersonReceivables = { person: Person; total: number; overdueTotal: number; currentTotal: number; items: ReceivableItem[] };
    
    const groupedReceivables: Record<Person, PersonReceivables> = {
      'Mccley': { person: 'Mccley', total: 0, overdueTotal: 0, currentTotal: 0, items: [] },
      'Paula': { person: 'Paula', total: 0, overdueTotal: 0, currentTotal: 0, items: [] },
      'Tarcilla': { person: 'Tarcilla', total: 0, overdueTotal: 0, currentTotal: 0, items: [] },
      'Jan': { person: 'Jan', total: 0, overdueTotal: 0, currentTotal: 0, items: [] },
      'Saulo': { person: 'Saulo', total: 0, overdueTotal: 0, currentTotal: 0, items: [] },
      'Jorge': { person: 'Jorge', total: 0, overdueTotal: 0, currentTotal: 0, items: [] },
      'Edielton': { person: 'Edielton', total: 0, overdueTotal: 0, currentTotal: 0, items: [] }
    };

    const processReceivable = (person: Person, share: number, exp: Expense, isCurrentMonth: boolean, isPastMonth: boolean) => {
      if ((isCurrentMonth || isPastMonth) && !exp.receivedFrom?.includes(person)) {
        groupedReceivables[person].items.push({
          id: exp.id,
          type: 'expense',
          amount: share,
          description: exp.description,
          isOverdue: isPastMonth,
          date: new Date(exp.dueDate)
        });
        groupedReceivables[person].total += share;
        if (isPastMonth) groupedReceivables[person].overdueTotal += share;
        else groupedReceivables[person].currentTotal += share;
      }
    };

    expenses.forEach(exp => {
      const { year: expYear, month: expMonth } = parseDueDate(exp.dueDate);
      
      const isCurrentMonth = expMonth === currentMonth && expYear === currentYear;
      const isPastMonth = expYear < currentYear || (expYear === currentYear && expMonth < currentMonth);

      let mccleyShare = 0;

      if (exp.costCenter === 'Compartilhado' && exp.splitWith) {
        const includesMccley = exp.splitWith.includes('Mccley');
        const divisor = includesMccley ? exp.splitWith.length : exp.splitWith.length + 1;
        const share = exp.value / divisor;
        
        mccleyShare = share; // Mccley always takes one share in shared

        exp.splitWith.forEach(person => {
          if (person !== 'Mccley') {
            processReceivable(person, share, exp, isCurrentMonth, isPastMonth);
          }
        });
      } else if (exp.costCenter === 'Individual' && exp.individualPerson) {
        if (exp.individualPerson === 'Mccley') {
          mccleyShare = exp.value;
        } else {
          processReceivable(exp.individualPerson, exp.value, exp, isCurrentMonth, isPastMonth);
        }
      } else if (exp.costCenter === 'Lunna 50%') {
        const share = exp.value * 0.5;
        mccleyShare = share;
        processReceivable('Tarcilla', share, exp, isCurrentMonth, isPastMonth);
      } else if (exp.costCenter === 'Lunna 30%') {
        mccleyShare = exp.value * 0.7;
        const share = exp.value * 0.3;
        processReceivable('Tarcilla', share, exp, isCurrentMonth, isPastMonth);
      }

      mccleyTotalExpenses += mccleyShare;
      if (isCurrentMonth) {
        currentMonthMccleyExpenses += mccleyShare;
      }
      if (mccleyShare > 0) {
        mccleyExpensesByCard[exp.card] += mccleyShare;
      }
    });

    // Add loans to current receivables
    loans.forEach(loan => {
      if (loan.installmentsPaid < loan.installmentsTotal) {
        const person = loan.person as Person;
        if (groupedReceivables[person]) {
          groupedReceivables[person].items.push({
            id: loan.id,
            type: 'loan',
            amount: loan.monthlyValue,
            description: `Empréstimo (${loan.description})`,
            isOverdue: false,
            date: new Date()
          });
          groupedReceivables[person].total += loan.monthlyValue;
          groupedReceivables[person].currentTotal += loan.monthlyValue;
        }
      }
    });

    const activeReceivables = Object.values(groupedReceivables).filter(g => g.total > 0);
    const currentMonthToReceive = activeReceivables.reduce((acc, curr) => acc + curr.total, 0); // Using total (overdue + current)

    const currentMonthRevenue = revenues.find(r => r.month === currentMonth && r.year === currentYear)?.value || 0;

    // Future expenses for Mccley (current year, months > currentMonth)
    const futureExpensesData: { month: string, value: number }[] = [];
    const monthNamesShort = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    
    for (let m = currentMonth + 1; m < 12; m++) {
      let monthlyMccleyTotal = 0;
      expenses.forEach(exp => {
        const { year: expYear, month: expMonth } = parseDueDate(exp.dueDate);
        if (expMonth === m && expYear === currentYear) {
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

    // Helper para agrupar retroativamente (heurística)
    const getGroupId = (exp: Expense) => {
      if (exp.groupId) return exp.groupId;
      const baseDesc = exp.description.replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '').trim();
      return `retro-${baseDesc}-${exp.value}-${exp.costCenter}`;
    };

    // Filtered expenses for the report
    const filteredExpenses = expenses.filter(exp => {
      const { year: expYear, month: expMonth } = parseDueDate(exp.dueDate);
      const matchesMonth = (reportFilters.month === 'Todos' || expMonth === reportFilters.month) && 
                           (reportFilters.year === 'Todos' || expYear === reportFilters.year);
      const matchesCategory = reportFilters.category === 'Todas' || exp.category === reportFilters.category;
      const matchesCostCenter = reportFilters.costCenter === 'Todos' || exp.costCenter === reportFilters.costCenter;
      
      let belongsToPerson = false;
      if (reportFilters.person === 'Todos') {
        belongsToPerson = true;
      } else {
        if (exp.costCenter === 'Individual' && exp.individualPerson === reportFilters.person) belongsToPerson = true;
        if (exp.costCenter === 'Compartilhado' && exp.splitWith?.includes(reportFilters.person as Person)) belongsToPerson = true;
        if (reportFilters.person === 'Tarcilla' && (exp.costCenter === 'Lunna 50%' || exp.costCenter === 'Lunna 30%')) belongsToPerson = true;
      }

      const matchesPerson = belongsToPerson;

      // Status logic: "Paid" if all responsible people are in receivedFrom
      let isPaid = false;
      if (exp.costCenter === 'Compartilhado' && exp.splitWith) {
        const peopleToPay = exp.splitWith.filter(p => p !== 'Mccley');
        isPaid = peopleToPay.length > 0 && peopleToPay.every(p => exp.receivedFrom?.includes(p));
      } else if (exp.costCenter === 'Individual' && exp.individualPerson && exp.individualPerson !== 'Mccley') {
        isPaid = !!exp.receivedFrom?.includes(exp.individualPerson);
      } else if (exp.costCenter === 'Lunna 50%' || exp.costCenter === 'Lunna 30%') {
        isPaid = !!exp.receivedFrom?.includes('Tarcilla');
      } else if (exp.costCenter === 'Individual' && exp.individualPerson === 'Mccley') {
        isPaid = true; // Mccley's own individual expenses don't have receivables, treat as paid
      }

      let matchesStatus = true;
      if (reportFilters.status === 'Pagas') matchesStatus = isPaid;
      if (reportFilters.status === 'Em Aberto') matchesStatus = !isPaid;

      return matchesMonth && matchesCategory && matchesCostCenter && matchesPerson && matchesStatus;
    }).map(exp => ({ ...exp, groupId: getGroupId(exp) }));

    const reportTotal = filteredExpenses.reduce((acc, exp) => {
      return acc + getExpensePersonShare(exp, reportFilters.person);
    }, 0);

    const personReportTotal = reportTotal;

    const reportRevenue = (reportFilters.month === 'Todos' || reportFilters.year === 'Todos') ? 0 :
                          revenues.find(r => r.month === reportFilters.month && r.year === reportFilters.year)?.netSalary || 
                          revenues.find(r => r.month === reportFilters.month && r.year === reportFilters.year)?.value || 0;

    const reportByCategory = filteredExpenses.reduce((acc, exp) => {
      const share = getExpensePersonShare(exp, reportFilters.person);
      acc[exp.category] = (acc[exp.category] || 0) + share;
      return acc;
    }, {} as Record<string, number>);

    return {
      mccleyTotalExpenses,
      currentMonthMccleyExpenses,
      mccleyExpensesByCard,
      currentMonthToReceive,
      activeReceivables,
      currentMonthRevenue,
      futureExpensesData,
      filteredExpenses,
      reportTotal,
      personReportTotal,
      reportRevenue,
      reportByCategory
    };
  }, [expenses, reportFilters, revenues, loans]);

  const handleToggleReceived = (id: string, person: Person, type: 'expense' | 'loan') => {
    if (type === 'expense') {
      let updatedExpense: Expense | null = null;
      setExpenses(prev => prev.map(exp => {
        if (exp.id === id) {
          const receivedFrom = exp.receivedFrom || [];
          const newReceived = receivedFrom.includes(person)
            ? receivedFrom.filter(p => p !== person)
            : [...receivedFrom, person];
          updatedExpense = { ...exp, receivedFrom: newReceived };
          return updatedExpense;
        }
        return exp;
      }));
      if (updatedExpense) {
        saveExpensesToSupabase([updatedExpense]);
      }
    } else if (type === 'loan') {
      let updatedLoan: Loan | null = null;
      setLoans(prev => prev.map(loan => {
        if (loan.id === id) {
          const payment = { date: new Date().toISOString(), amount: loan.monthlyValue };
          updatedLoan = {
            ...loan,
            installmentsPaid: loan.installmentsPaid + 1,
            paymentHistory: [...(loan.paymentHistory || []), payment]
          };
          return updatedLoan;
        }
        return loan;
      }));
      if (updatedLoan) {
        saveLoansToSupabase([updatedLoan]);
      }
    }
  };

  const handleToggleAllReceived = (exp: Expense) => {
    let peopleToPay: Person[] = [];
    if (exp.costCenter === 'Compartilhado' && exp.splitWith) {
      peopleToPay = exp.splitWith.filter(p => p !== 'Mccley');
    } else if (exp.costCenter === 'Individual' && exp.individualPerson && exp.individualPerson !== 'Mccley') {
      peopleToPay = [exp.individualPerson];
    } else if (exp.costCenter === 'Lunna 50%' || exp.costCenter === 'Lunna 30%') {
      peopleToPay = ['Tarcilla'];
    }

    if (peopleToPay.length === 0) return;

    const isPaid = peopleToPay.every(p => exp.receivedFrom?.includes(p));
    let updatedExpense: Expense | null = null;

    setExpenses(prev => prev.map(e => {
      if (e.id === exp.id) {
        if (isPaid) {
          updatedExpense = { ...e, receivedFrom: (e.receivedFrom || []).filter(p => !peopleToPay.includes(p)) };
        } else {
          const newReceived = new Set([...(e.receivedFrom || []), ...peopleToPay]);
          updatedExpense = { ...e, receivedFrom: Array.from(newReceived) };
        }
        return updatedExpense;
      }
      return e;
    }));

    if (updatedExpense) {
      saveExpensesToSupabase([updatedExpense]);
    }
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
    const filterMonthText = reportFilters.month === 'Todos' ? 'Todos' : monthNames[reportFilters.month as number];
    const filterYearText = reportFilters.year === 'Todos' ? 'Todos' : reportFilters.year;
    const filterText = `Filtros: ${filterMonthText}/${filterYearText} | Categoria: ${reportFilters.category} | Centro de Custo: ${reportFilters.costCenter} | Pessoa: ${reportFilters.person}`;
    doc.text(filterText, 14, 30);
    
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(`Quantidade de Lançamentos: ${totals.filteredExpenses.length}`, 14, 40);

    // Table
    const tableColumn = ['Descrição', 'Vencimento', 'Centro de Custo', 'Valor (R$)', 'Categoria', 'Cartão'];
    const tableRows = totals.filteredExpenses.map(exp => {
      const share = getExpensePersonShare(exp, reportFilters.person);
      return [
        exp.description,
        formatDateBR(exp.dueDate),
        exp.costCenter,
        share.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        exp.category,
        exp.card
      ];
    });

    tableRows.push([
      'TOTAL',
      '',
      '',
      totals.reportTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      '',
      ''
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 45 },
      didParseCell: function(data: any) {
        if (data.section === 'body' && data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 230, 230];
        }
      }
    });

    doc.save(`relatorio_financeiro_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    
    let itemsToSave: Expense[] = [];

    if (editingId) {
      const originalExpense = expenses.find(exp => exp.id === editingId);
      if (originalExpense && applyToFuture) {
        const originalGroupId = getGroupId(originalExpense);
        const groupItems = expenses.filter(exp => 
          (originalExpense.groupId && exp.groupId === originalExpense.groupId) || (getGroupId(exp) === originalGroupId)
        ).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        const baseDesc = (formData.description || '').replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '').trim();
        const totalItems = groupItems.length;

        const updatedExpensesMap = new Map<string, Expense>();

        groupItems.forEach((exp, index) => {
          let updatedDesc = formData.description;
          if (totalItems > 1 && /\(\s*\d+\s*\/\s*\d+\s*\)/.test(exp.description)) {
            const match = exp.description.match(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/);
            const k = match ? match[1] : (index + 1);
            const n = match ? match[2] : totalItems;
            updatedDesc = `${baseDesc} (${k}/${n})`;
          }

          updatedExpensesMap.set(exp.id, {
            ...exp,
            costCenter: formData.costCenter as CostCenter,
            splitWith: formData.splitWith,
            individualPerson: formData.individualPerson,
            description: updatedDesc || exp.description,
            value: formData.value || exp.value,
            category: formData.category as Category,
            card: formData.card as Card,
          });
        });

        const updatedExpenses = expenses.map(exp => updatedExpensesMap.get(exp.id) || exp);
        itemsToSave = Array.from(updatedExpensesMap.values());
        setExpenses(updatedExpenses);
      } else {
        const updated = { ...expenses.find(exp => exp.id === editingId)!, ...formData as Expense };
        itemsToSave = [updated];
        setExpenses(expenses.map(exp => exp.id === editingId ? updated : exp));
      }
      setEditingId(null);
      setApplyToFuture(false);
    } else if (formData.isRecurring) {
      const { year: baseYear, month: baseMonth, day: baseDay } = parseDueDate(formData.dueDate || new Date().toISOString().split('T')[0]);
      const newEntries: Expense[] = [];
      const count = formData.recurringCount || 2;
      const groupId = Math.random().toString(36).substr(2, 9);
      
      for (let i = 0; i < count; i++) {
        let m = baseMonth + i;
        let y = baseYear + Math.floor(m / 12);
        m = m % 12;
        
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const actualDay = Math.min(baseDay, daysInMonth);
        
        const formattedMonth = String(m + 1).padStart(2, '0');
        const formattedDay = String(actualDay).padStart(2, '0');
        const dueDateStr = `${y}-${formattedMonth}-${formattedDay}`;
        
        newEntries.push({
          ...formData as Expense,
          id: Math.random().toString(36).substr(2, 9),
          groupId,
          dueDate: dueDateStr,
          createdAt: Date.now()
        });
      }
      itemsToSave = newEntries;
      setExpenses([...newEntries, ...expenses]);
    } else {
      const newExpense: Expense = {
        ...formData as Expense,
        id: Math.random().toString(36).substr(2, 9),
        createdAt: Date.now()
      };
      itemsToSave = [newExpense];
      setExpenses([newExpense, ...expenses]);
    }

    if (itemsToSave.length > 0) {
      saveExpensesToSupabase(itemsToSave);
    }

    setShowForm(false);
    setActiveTab('ledger');
    setFormData(initialFormState);
  };

  const handleEdit = (expense: Expense) => {
    const targetGroupId = getGroupId(expense);
    const groupExpenses = expenses.filter(exp => 
      (expense.groupId && exp.groupId === expense.groupId) || (getGroupId(exp) === targetGroupId)
    ).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const rootExpense = groupExpenses.length > 0 ? groupExpenses[0] : expense;

    setFormData(rootExpense);
    setEditingId(rootExpense.id);
    setApplyToFuture(false);
    setActiveTab('expenses');
  };

  const handleDelete = (id: string) => {
    const originalExpense = expenses.find(exp => exp.id === id);
    if (!originalExpense) return;

    let idsToDelete: string[] = [id];

    if (applyToFuture) {
      const originalGroupId = getGroupId(originalExpense);
      idsToDelete = expenses.filter(exp => {
        if (exp.id === id) return true;
        
        const matchesGroup = (originalExpense.groupId && exp.groupId === originalExpense.groupId) ||
                             (getGroupId(exp) === originalGroupId);

        if (matchesGroup && exp.dueDate >= originalExpense.dueDate) return true;
        return false;
      }).map(exp => exp.id);
    }

    setExpenses(expenses.filter(exp => !idsToDelete.includes(exp.id)));
    deleteExpensesFromSupabase(idsToDelete);

    setShowDeleteConfirm(null);
    setApplyToFuture(false);
  };

  const togglePersonInSplit = (person: Person) => {
    const current = formData.splitWith || [];
    if (current.includes(person)) {
      setFormData({ ...formData, splitWith: current.filter(p => p !== person) });
    } else {
      setFormData({ ...formData, splitWith: [...current, person] });
    }
  };

  const handleRevenueCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const newRevenues: MonthlyRevenue[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const separator = lines[0].includes(';') ? ';' : ',';
        const cols = lines[i].split(separator).map(s => s.trim());
        
        // Se usar ',' como separador mas tiver mais colunas, o CSV quebrou devido às vírgulas nos decimais
        if (separator === ',' && cols.length > 6) {
           alert(`Erro na linha ${i}: O arquivo CSV está usando vírgulas para separar as colunas e também nos números decimais. Por favor, baixe o novo modelo e use ponto-e-vírgula (;) para separar as colunas.`);
           return;
        }

        const [monthStr, year, salary, commission, dsr, netSalary] = cols;
        
        const monthMap: Record<string, number> = {
          'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3, 'maio': 4, 'junho': 5,
          'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11
        };
        const month = monthMap[(monthStr || '').toLowerCase()];
        
        if (month !== undefined) {
          const s = parseFloat((salary || '0').replace(/\./g, '').replace(',', '.')) || 0;
          const c = parseFloat((commission || '0').replace(/\./g, '').replace(',', '.')) || 0;
          const d = parseFloat((dsr || '0').replace(/\./g, '').replace(',', '.')) || 0;
          const ns = parseFloat((netSalary || '0').replace(/\./g, '').replace(',', '.')) || 0;
          
          newRevenues.push({
            id: Math.random().toString(36).substr(2, 9),
            month,
            year: parseInt(year),
            salary: s,
            commission: c,
            dsr: d,
            grossSalary: s + c + d,
            netSalary: ns,
            value: ns
          });
        }
      }

      if (newRevenues.length > 0) {
        setRevenues(prev => {
          const filtered = prev.filter(p => !newRevenues.some(nr => nr.month === p.month && nr.year === p.year));
          return [...filtered, ...newRevenues];
        });
        saveRevenuesToSupabase(newRevenues);
      }
    };
    reader.readAsText(file);
  };

  const downloadRevenueCSVTemplate = () => {
    const csvContent = "Mês;Ano;Salário;Comissão;DSR;Salário Líquido\nAgosto;2026;5000,00;1000,00;500,00;5500,00\nSetembro;2026;5000,00;1200,00;600,00;5800,00";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_receitas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-900/20 rounded-full border border-red-500/20" title={syncErrorMsg || 'Erro'}>
                <AlertCircle className="w-3 h-3 text-red-500" />
                <span className="text-[9px] font-bold text-red-500 tracking-wider break-words max-w-[200px]">
                  {syncErrorMsg ? syncErrorMsg : 'ERRO DE CONEXÃO'}
                </span>
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
            <div className="grid grid-cols-1 gap-4 pt-4">
              <div className="bg-[#171717] p-8 rounded-3xl border border-white/5 shadow-xl shadow-red-900/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-red-900/20 flex items-center justify-center">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-red-500">Despesa Total (Mês Atual)</p>
                </div>
                <p className="text-4xl font-bold">R$ {totals.currentMonthMccleyExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Values to Receive Section */}
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <h3 className="text-2xl font-bold">Valores a Receber</h3>
                  <p className="text-sm text-gray-500">Recebíveis agrupados por pessoa</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Total Pendente</p>
                  <p className="text-2xl font-bold text-[#10B981]">
                    R$ {totals.currentMonthToReceive.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Grouped Receivables List */}
              <div className="space-y-4">
                {totals.activeReceivables.length === 0 ? (
                  <div className="bg-[#171717] p-8 rounded-3xl border border-white/5 text-center text-gray-600">
                    Nenhum recebível pendente no momento.
                  </div>
                ) : (
                  totals.activeReceivables.map((group, idx) => (
                    <div key={`${group.person}-${idx}`} className="bg-[#171717] rounded-3xl border border-white/5 overflow-hidden transition-all duration-300">
                      <div 
                        className="p-6 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => setExpandedPerson(expandedPerson === group.person ? null : group.person)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-[#262626] rounded-full flex items-center justify-center border border-white/10 text-[#10B981] font-bold text-lg">
                            {group.person.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-xl text-gray-100">{group.person}</span>
                            <div className="flex gap-4 mt-1 text-xs">
                              {group.overdueTotal > 0 && (
                                <span className="font-bold text-red-500">Vencido: R$ {group.overdueTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              )}
                              {group.currentTotal > 0 && (
                                <span className="font-bold text-gray-400">Vencendo: R$ {group.currentTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="text-2xl font-bold text-[#10B981]">
                            R$ {group.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <motion.div
                            animate={{ rotate: expandedPerson === group.person ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronRight className="w-6 h-6 text-gray-600" />
                          </motion.div>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedPerson === group.person && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-t border-white/5 bg-[#0A0A0A]/30"
                          >
                            <div className="p-6 space-y-3">
                              {group.items.sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue)).map((item, i) => (
                                <div key={`${item.id}-${i}`} className="flex justify-between items-center p-4 bg-[#171717] rounded-xl border border-white/5">
                                  <div className="flex items-center gap-4">
                                    <input 
                                      type="checkbox" 
                                      className="w-5 h-5 rounded border-gray-700 bg-transparent text-[#10B981] focus:ring-[#10B981]"
                                      onChange={() => handleToggleReceived(item.id, group.person, item.type)}
                                    />
                                    <div>
                                      <p className="font-bold text-sm text-gray-200">{item.description}</p>
                                      <p className={`text-[10px] font-bold uppercase tracking-wider ${item.isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                                        {item.isOverdue ? `Vencido (${item.date.toLocaleDateString('pt-BR')})` : 'Mês Atual'} {item.type === 'loan' ? '• Empréstimo' : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <p className="font-bold text-gray-300">
                                    R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
              {/* Bloco 1: Informações Básicas */}
              <div className="bg-[#171717] p-8 rounded-[2rem] border border-white/5 space-y-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-900/30 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-[#10B981]" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Informações Básicas</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Amount */}
                  <div className="space-y-2 col-span-1 md:col-span-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#10B981]">Valor da Transação</p>
                    <div className="flex items-baseline gap-4 bg-[#262626]/50 p-6 rounded-2xl border border-white/5 focus-within:border-[#10B981]/50 transition-colors">
                      <span className="text-3xl font-bold text-gray-500">R$</span>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="0,00"
                        className="bg-transparent text-5xl font-bold outline-none w-full placeholder:text-gray-700 text-white"
                        value={formData.value || ''}
                        onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) })}
                        required
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Descrição</p>
                    <div className="relative">
                      <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                      <input 
                        type="text" 
                        placeholder="O que você comprou?"
                        className="w-full bg-[#262626]/50 border border-white/5 focus:border-[#10B981]/50 rounded-xl p-4 pl-12 text-gray-300 outline-none placeholder:text-gray-600 transition-colors"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {/* Date */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Vencimento</p>
                    <div className="relative">
                      <input 
                        type="date" 
                        className="w-full bg-[#262626]/50 border border-white/5 focus:border-[#10B981]/50 rounded-xl p-4 text-gray-300 outline-none transition-colors"
                        value={formData.dueDate}
                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco 2: Classificação e Pagamento */}
              <div className="bg-[#171717] p-8 rounded-[2rem] border border-white/5 space-y-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-blue-900/30 flex items-center justify-center">
                    <Tag className="w-4 h-4 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Classificação & Pagamento</h3>
                </div>

                <div className="space-y-6">
                  {/* Category Card */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Categoria</p>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFormData({ ...formData, category: c })}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                            formData.category === c 
                              ? 'bg-blue-900/40 text-blue-400 border-blue-500/50 shadow-lg shadow-blue-900/20' 
                              : 'bg-[#262626]/50 text-gray-400 border-transparent hover:bg-[#333333]'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Payment Method */}
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Método de Pagamento</p>
                      <div className="flex flex-wrap gap-2">
                        {CARDS.map(card => (
                          <button
                            key={card}
                            type="button"
                            onClick={() => setFormData({ ...formData, card })}
                            className={`flex-1 p-3 rounded-2xl border transition-all flex flex-col items-center justify-center gap-2 min-w-[70px] ${
                              formData.card === card 
                                ? 'bg-[#064E3B]/20 border-[#10B981] text-[#10B981] shadow-lg shadow-emerald-900/10' 
                                : 'bg-[#262626]/50 border-transparent text-gray-500'
                            }`}
                          >
                            <CreditCard className="w-5 h-5" />
                            <p className="text-[10px] font-bold uppercase">{card}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Installments */}
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Parcelamento</p>
                      <select 
                        className="w-full h-[88px] bg-[#262626]/50 border border-white/5 focus:border-[#10B981]/50 rounded-2xl p-4 text-gray-300 outline-none appearance-none transition-colors text-lg"
                        value={formData.installments}
                        onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                      >
                        <option value="À vista">À vista</option>
                        {[...Array(12)].map((_, i) => (
                          <option key={i} value={`${i + 1}x`}>{i + 1}x</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco 3: Rateio e Repetição */}
              <div className="bg-[#171717] p-8 rounded-[2rem] border border-white/5 space-y-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-purple-900/30 flex items-center justify-center">
                    <Users className="w-4 h-4 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Rateio & Repetição</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Cost Center Card */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">Centro de Custo</p>
                    <select 
                      className="w-full bg-[#262626]/50 border border-white/5 focus:border-[#10B981]/50 rounded-xl p-4 text-gray-300 outline-none appearance-none transition-colors"
                      value={formData.costCenter}
                      onChange={(e) => setFormData({ ...formData, costCenter: e.target.value as CostCenter })}
                    >
                      {COST_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Debtor Card (Conditional) */}
                  {(formData.costCenter === 'Compartilhado' || formData.costCenter === 'Individual') ? (
                    <div className="space-y-2">
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
                            className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border ${
                              (formData.individualPerson === p || formData.splitWith?.includes(p))
                                ? 'bg-[#064E3B] text-[#10B981] border-[#10B981] shadow-lg shadow-emerald-900/20' 
                                : 'bg-[#262626]/50 text-gray-400 border-transparent hover:bg-[#333333]'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 flex items-center justify-center bg-[#262626]/20 rounded-xl p-4 border border-white/5 border-dashed">
                       <p className="text-xs text-gray-500 text-center">Rateio automático aplicado:<br/> {formData.costCenter}</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-white/5 pt-6 mt-6">
                  {/* Recurring Toggle */}
                  <div className="flex items-center justify-between bg-[#262626]/30 p-5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${formData.isRecurring ? 'bg-emerald-900/30' : 'bg-[#333]'}`}>
                        <RefreshCw className={`w-6 h-6 ${formData.isRecurring ? 'text-[#10B981]' : 'text-gray-600'}`} />
                      </div>
                      <div>
                        <p className="text-base font-bold text-white">Despesa Recorrente</p>
                        <p className="text-xs text-gray-500">Gerar lançamentos automáticos para os próximos meses</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <AnimatePresence>
                        {formData.isRecurring && (
                          <motion.div 
                            initial={{ opacity: 0, width: 0 }} 
                            animate={{ opacity: 1, width: 'auto' }} 
                            exit={{ opacity: 0, width: 0 }}
                            className="flex items-center gap-2"
                          >
                            <span className="text-[10px] uppercase font-bold text-gray-500">Repetir</span>
                            <input 
                              type="number" 
                              min="2"
                              max="120"
                              className="w-16 bg-[#171717] border border-white/10 rounded-lg p-2 text-center text-white outline-none focus:border-[#10B981]"
                              value={formData.recurringCount || 2}
                              onChange={(e) => setFormData({ ...formData, recurringCount: parseInt(e.target.value) || 2 })}
                            />
                            <span className="text-[10px] uppercase font-bold text-gray-500">Vezes</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <button 
                        type="button"
                        onClick={() => setFormData({ ...formData, isRecurring: !formData.isRecurring })}
                        className={`w-14 h-7 rounded-full transition-colors relative shadow-inner ${formData.isRecurring ? 'bg-[#10B981]' : 'bg-gray-800'}`}
                      >
                        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow-md ${formData.isRecurring ? 'left-8' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              {(() => {
                const editingExp = editingId ? expenses.find(e => e.id === editingId) : null;
                if (!editingExp) return null;

                const targetGroupId = getGroupId(editingExp);
                const hasMatchingFutureItems = expenses.some(e => {
                  if (e.id === editingExp.id) return false;
                  const matchesGroup = (editingExp.groupId && e.groupId === editingExp.groupId) || (getGroupId(e) === targetGroupId);
                  return matchesGroup && e.dueDate >= editingExp.dueDate;
                });

                const isGroupOrParcel = Boolean(
                  editingExp.groupId ||
                  editingExp.isRecurring ||
                  (editingExp.installments && editingExp.installments !== 'À vista' && editingExp.installments !== '1x') ||
                  /\(\s*\d+\s*\/\s*\d+\s*\)/.test(editingExp.description) ||
                  hasMatchingFutureItems
                );

                if (!isGroupOrParcel) return null;

                return (
                  <div className="flex items-center gap-3 p-4 bg-[#262626]/50 rounded-2xl border border-white/5 mb-4">
                    <input 
                      type="checkbox" 
                      id="applyToFuture"
                      checked={applyToFuture}
                      onChange={(e) => setApplyToFuture(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-700 bg-transparent text-[#10B981] focus:ring-[#10B981] cursor-pointer shrink-0"
                    />
                    <label htmlFor="applyToFuture" className="text-sm text-gray-300 font-medium cursor-pointer">
                      Aplicar alterações a todas as parcelas/lançamentos deste item.
                    </label>
                  </div>
                );
              })()}
              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#34D399] hover:to-[#10B981] text-black py-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-900/20 active:scale-[0.98] transition-all"
              >
                {editingId ? 'Salvar Alterações' : 'Confirmar Transação'} <ArrowRight className="w-6 h-6" />
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
            <div className="bg-[#171717] p-4 sm:p-6 rounded-3xl border border-white/5 space-y-4 sm:space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Mês</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-xs sm:text-sm text-gray-300 outline-none"
                    value={reportFilters.month}
                    onChange={(e) => setReportFilters({ ...reportFilters, month: e.target.value === 'Todos' ? 'Todos' : parseInt(e.target.value) })}
                  >
                    <option value="Todos">Todos</option>
                    {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                      <option key={m} value={i}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Ano</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-xs sm:text-sm text-gray-300 outline-none"
                    value={reportFilters.year}
                    onChange={(e) => setReportFilters({ ...reportFilters, year: e.target.value === 'Todos' ? 'Todos' : parseInt(e.target.value) })}
                  >
                    <option value="Todos">Todos</option>
                    {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Categoria</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-xs sm:text-sm text-gray-300 outline-none"
                    value={reportFilters.category}
                    onChange={(e) => setReportFilters({ ...reportFilters, category: e.target.value })}
                  >
                    <option value="Todas">Todas</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Centro de Custo</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-xs sm:text-sm text-gray-300 outline-none"
                    value={reportFilters.costCenter}
                    onChange={(e) => setReportFilters({ ...reportFilters, costCenter: e.target.value })}
                  >
                    <option value="Todos">Todos</option>
                    {COST_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Pessoa</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-xs sm:text-sm text-gray-300 outline-none"
                    value={reportFilters.person}
                    onChange={(e) => setReportFilters({ ...reportFilters, person: e.target.value })}
                  >
                    <option value="Todos">Todos</option>
                    {PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Status</p>
                  <select 
                    className="w-full bg-[#262626] border-none rounded-xl p-3 text-xs sm:text-sm text-gray-300 outline-none"
                    value={reportFilters.status}
                    onChange={(e) => setReportFilters({ ...reportFilters, status: e.target.value })}
                  >
                    <option value="Em Aberto">Em Aberto</option>
                    <option value="Pagas">Pagas</option>
                    <option value="Todas">Todas</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Dashboard Visual */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Balance Summary Card */}
              <div className={`p-6 sm:p-8 rounded-3xl text-white shadow-lg relative overflow-hidden flex flex-col justify-between ${reportFilters.person === 'Todos' ? (totals.reportRevenue - totals.personReportTotal >= 0 ? 'bg-gradient-to-br from-[#10B981] to-[#059669] shadow-emerald-900/20' : 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-900/20') : 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-900/20'}`}>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-70 mb-1 truncate">
                        {reportFilters.person === 'Todos' ? 'Mccley - Saldo do Mês' : `${reportFilters.person} - Total Selecionado`}
                      </p>
                      <h3 className="text-3xl sm:text-4xl font-bold truncate">
                        R$ {(reportFilters.person === 'Todos' ? totals.reportRevenue - totals.personReportTotal : totals.personReportTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h3>
                    </div>
                    <button 
                      onClick={exportToPDF}
                      className="flex items-center gap-2 bg-black/20 hover:bg-black/40 text-white px-3 sm:px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors backdrop-blur-sm shrink-0"
                    >
                      <Download className="w-4 h-4" /> <span className="hidden sm:inline">PDF</span>
                    </button>
                  </div>
                  
                  {reportFilters.person === 'Todos' && (
                  <div className="space-y-3 pt-4 border-t border-white/20">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-bold opacity-80">Receita Líquida:</span>
                      <span className="font-bold">+ R$ {totals.reportRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-bold opacity-80">Despesas (Sua parte):</span>
                      <span className="font-bold">- R$ {totals.personReportTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                    </div>
                  </div>
                  )}
                </div>
                <BarChart3 className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 -rotate-12" />
              </div>

              {/* Categories Chart */}
              <div className="bg-[#171717]/80 backdrop-blur-xl p-6 sm:p-8 rounded-3xl sm:rounded-[2rem] border border-white/5 space-y-6 shadow-xl">
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
                totals.filteredExpenses.map((exp) => {
                  let isPaid = false;
                  if (exp.costCenter === 'Compartilhado' && exp.splitWith) {
                    const peopleToPay = exp.splitWith.filter(p => p !== 'Mccley');
                    isPaid = peopleToPay.length > 0 && peopleToPay.every(p => exp.receivedFrom?.includes(p));
                  } else if (exp.costCenter === 'Individual' && exp.individualPerson && exp.individualPerson !== 'Mccley') {
                    isPaid = !!exp.receivedFrom?.includes(exp.individualPerson);
                  } else if (exp.costCenter === 'Lunna 50%' || exp.costCenter === 'Lunna 30%') {
                    isPaid = !!exp.receivedFrom?.includes('Tarcilla');
                  } else if (exp.costCenter === 'Individual' && exp.individualPerson === 'Mccley') {
                    isPaid = true;
                  }

                  const hasPeopleToPay = !(exp.costCenter === 'Individual' && exp.individualPerson === 'Mccley');

                  return (
                  <div key={exp.id} className={`p-4 md:p-6 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0 group transition-colors ${isPaid ? 'bg-[#064E3B]/10 border-[#10B981]/20' : 'bg-[#171717] border-white/5'}`}>
                    {/* Left Section - Description and Details */}
                    <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto flex-1 min-w-0">
                      {hasPeopleToPay && (
                        <input 
                          type="checkbox" 
                          checked={isPaid}
                          onChange={() => handleToggleAllReceived(exp)}
                          className="w-5 h-5 rounded border-gray-700 bg-transparent text-[#10B981] focus:ring-[#10B981] cursor-pointer shrink-0"
                        />
                      )}
                      <div className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-2xl flex items-center justify-center ${exp.category === 'Lunna' ? 'bg-purple-900/20 text-purple-400' : 'bg-emerald-900/20 text-[#10B981]'}`}>
                        <Receipt className="w-5 h-5 md:w-6 md:h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`font-bold truncate ${isPaid ? 'text-gray-400 line-through' : 'text-white'}`} title={exp.description}>{exp.description}</p>
                          {isPaid && <CheckCircle className="w-4 h-4 text-[#10B981] shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-500 whitespace-nowrap">{formatDateBR(exp.dueDate)}</p>
                          <span className="w-1 h-1 rounded-full bg-gray-700 shrink-0" />
                          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold truncate">{exp.costCenter}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right Section - Amounts and Actions */}
                    <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto border-t md:border-t-0 border-white/5 pt-3 md:pt-0 shrink-0">
                      {(() => {
                        const displayShare = getExpensePersonShare(exp, reportFilters.person);
                        const isShared = reportFilters.person !== 'Todos' && Math.abs(displayShare - exp.value) > 0.01;

                        return (
                          <div className="text-left md:text-right">
                            <p className="font-bold text-lg whitespace-nowrap">R$ {displayShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            {isShared && (
                              <p className="text-[10px] text-gray-500 font-medium">Total: R$ {exp.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            )}
                            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">{exp.card}</p>
                          </div>
                        );
                      })()}
                      <div className="flex gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
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
                  );
                })
              )}
            </div>
          </div>
        ) : activeTab === 'receita' ? (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 sm:gap-0">
              <div className="space-y-2">
                <h2 className="text-4xl font-bold">Lançar Receita</h2>
                <p className="text-gray-500 text-sm">Gerencie sua receita mensal e acompanhe as métricas.</p>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
                <button 
                  onClick={downloadRevenueCSVTemplate}
                  className="flex-1 sm:flex-none justify-center flex items-center gap-2 bg-[#262626] hover:bg-[#333] text-gray-300 px-4 py-3 sm:py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg whitespace-nowrap"
                >
                  <Download className="w-4 h-4" /> Modelo CSV
                </button>
                <label className="flex-1 sm:flex-none justify-center flex items-center gap-2 bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981] px-4 py-3 sm:py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer border border-[#10B981]/30 shadow-lg whitespace-nowrap">
                  <Upload className="w-4 h-4" /> Upload CSV
                  <input type="file" accept=".csv" className="hidden" onChange={handleRevenueCSVUpload} />
                </label>
              </div>
            </div>

            {/* Dashboard Média dos últimos 12 meses */}
            <div className="bg-[#171717]/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white/5 space-y-6 shadow-2xl">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Média dos últimos 12 meses</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-[#262626]/50 p-3 sm:p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Salário</p>
                  <p className="font-bold text-sm sm:text-lg text-white truncate" title={`R$ ${revenueAverages.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>R$ {revenueAverages.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-[#262626]/50 p-3 sm:p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Comissão</p>
                  <p className="font-bold text-sm sm:text-lg text-white truncate" title={`R$ ${revenueAverages.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>R$ {revenueAverages.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-[#262626]/50 p-3 sm:p-4 rounded-2xl border border-white/5">
                  <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">DSR</p>
                  <p className="font-bold text-sm sm:text-lg text-white truncate" title={`R$ ${revenueAverages.dsr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>R$ {revenueAverages.dsr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-emerald-900/10 p-3 sm:p-4 rounded-2xl border border-emerald-500/20 shadow-inner">
                  <p className="text-[10px] sm:text-xs text-emerald-500 uppercase tracking-wider font-bold mb-1 truncate">Salário Bruto</p>
                  <p className="font-bold text-sm sm:text-lg text-[#10B981] truncate" title={`R$ ${revenueAverages.grossSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>R$ {revenueAverages.grossSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
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
                  
                  saveRevenuesToSupabase([newRevenue]);
                  
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
                        <button onClick={() => {
                          setRevenueFormData({
                            month: r.month,
                            year: r.year,
                            salary: r.salary || 0,
                            commission: r.commission || 0,
                            dsr: r.dsr || 0,
                            netSalary: r.netSalary || r.value || 0
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }} className="text-blue-500 p-3 hover:bg-blue-500/10 rounded-xl transition-colors self-center">
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button onClick={() => {
                          setRevenues(revenues.filter(rev => rev.id !== r.id));
                          deleteRevenuesFromSupabase(r.month, r.year);
                        }} className="text-red-500 p-3 hover:bg-red-500/10 rounded-xl transition-colors self-center">
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
                      saveLoansToSupabase([newLoan]);
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
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-0">
                        <div>
                          <h4 className="font-bold text-lg text-white">{loan.person}</h4>
                          <p className="text-sm text-gray-400">{loan.description}</p>
                        </div>
                        <div className="text-left sm:text-right border-t border-white/5 pt-3 sm:pt-0 sm:border-0 w-full sm:w-auto">
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Total Emprestado</p>
                          <div className="flex items-center justify-start sm:justify-end gap-2">
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
                                      const updatedLoan = { ...loan, totalValue: editingTotal[loan.id] };
                                      setLoans(loans.map(l => l.id === loan.id ? updatedLoan : l));
                                      saveLoansToSupabase([updatedLoan]);
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

                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 gap-4 sm:gap-0">
                        <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-2">
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
                        
                        <div className="flex items-center justify-end w-full sm:w-auto gap-2">
                          {loan.installmentsPaid < loan.installmentsTotal && remainingBalance > 0 ? (
                            <button 
                              onClick={() => {
                                const newPayment = { date: new Date().toISOString(), amount: editingValue };
                                const updatedLoan = {
                                  ...loan,
                                  installmentsPaid: loan.installmentsPaid + 1,
                                  amountPaid: (loan.amountPaid ?? (loan.installmentsPaid * loan.monthlyValue)) + editingValue,
                                  paymentHistory: [...(loan.paymentHistory || []), newPayment]
                                };
                                setLoans(loans.map(l => l.id === loan.id ? updatedLoan : l));
                                saveLoansToSupabase([updatedLoan]);
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
                            onClick={() => {
                              setLoans(loans.filter(l => l.id !== loan.id));
                              deleteLoansFromSupabase([loan.id]);
                            }}
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
              
              {(() => {
                const targetExp = showDeleteConfirm ? expenses.find(e => e.id === showDeleteConfirm) : null;
                if (!targetExp) return null;

                const targetGroupId = getGroupId(targetExp);
                const hasMatchingFutureItems = expenses.some(e => {
                  if (e.id === targetExp.id) return false;
                  const matchesGroup = (targetExp.groupId && e.groupId === targetExp.groupId) || (getGroupId(e) === targetGroupId);
                  return matchesGroup && e.dueDate >= targetExp.dueDate;
                });

                const isGroupOrParcel = Boolean(
                  targetExp.groupId ||
                  targetExp.isRecurring ||
                  (targetExp.installments && targetExp.installments !== 'À vista' && targetExp.installments !== '1x') ||
                  /\(\s*\d+\s*\/\s*\d+\s*\)/.test(targetExp.description) ||
                  hasMatchingFutureItems
                );

                if (!isGroupOrParcel) return null;

                return (
                  <div className="flex items-start gap-3 p-4 bg-[#262626]/50 rounded-xl border border-white/5 text-left">
                    <input 
                      type="checkbox" 
                      id="deleteApplyToFuture"
                      checked={applyToFuture}
                      onChange={(e) => setApplyToFuture(e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border-gray-700 bg-transparent text-red-500 focus:ring-red-500 cursor-pointer"
                    />
                    <label htmlFor="deleteApplyToFuture" className="text-sm text-gray-300 font-medium cursor-pointer leading-tight">
                      Excluir também todas as parcelas/lançamentos futuros associados a este item.
                    </label>
                  </div>
                );
              })()}

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
