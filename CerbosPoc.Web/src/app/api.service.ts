import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

export type Section = 'expenses' | 'approvals' | 'reports' | 'admin';

export interface DemoUser {
  id: string;
  role: string;
  department: string | null;
}

export interface Me {
  user: DemoUser;
  sections: Record<Section, boolean>;
  canCreateExpense: boolean;
  policyVersion: string;
  canChangePolicyVersion: boolean;
}

export interface PolicyVersion {
  id: string;
  label: string;
  description: string;
  changes: string[];
}

export interface PolicyVersionState {
  active: string;
  versions: PolicyVersion[];
}

export interface Expense {
  id: string;
  ownerId: string;
  department: string;
  amount: number;
  status: string;
  description: string;
  allowedActions: Record<'view' | 'approve' | 'delete', boolean>;
}

export interface DepartmentReport {
  department: string;
  count: number;
  total: number;
  byStatus: Record<string, number>;
}

export interface UserSections {
  user: DemoUser;
  sections: Record<Section, boolean>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  users() {
    return this.http.get<DemoUser[]>('/api/users');
  }

  me() {
    return this.http.get<Me>('/api/me');
  }

  expenses() {
    return this.http.get<Expense[]>('/api/expenses');
  }

  createExpense(amount: number, description: string, submit: boolean) {
    return this.http.post<Expense>('/api/expenses', { amount, description, submit });
  }

  approve(id: string) {
    return this.http.post<void>(`/api/expenses/${id}/approve`, null);
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/expenses/${id}`);
  }

  approvals() {
    return this.http.get<Expense[]>('/api/approvals');
  }

  reports() {
    return this.http.get<DepartmentReport[]>('/api/reports');
  }

  adminUsers() {
    return this.http.get<UserSections[]>('/api/admin/users');
  }

  reset() {
    return this.http.post<void>('/api/admin/reset', null);
  }

  policyVersions() {
    return this.http.get<PolicyVersionState>('/api/policy-versions');
  }

  activatePolicyVersion(version: string) {
    return this.http.put<PolicyVersionState>('/api/policy-versions/active', { version });
  }
}
