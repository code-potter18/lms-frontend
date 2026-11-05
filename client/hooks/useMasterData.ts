import { useQuery } from "@tanstack/react-query";
import { branchApi, Branch } from "@/api/branch.api";
import { departmentApi, Department } from "@/api/department.api";
import { employeeApi, EmployeeRecord } from "@/api/employee.api";

const STALE_TIME_MASTER_DATA = 30 * 60 * 1000; // 30 minutes
const STALE_TIME_DOCTORS = 15 * 60 * 1000;     // 15 minutes

/**
 * Cached hook for hospital branches.
 */
export function useBranches() {
  const { data: branches = [], isLoading, error, refetch } = useQuery<Branch[]>({
    queryKey: ["master-branches"],
    queryFn: async () => {
      const res = await branchApi.getAll();
      const list = (res.data as any)?.data || (res.data as any)?.branches || [];
      return Array.isArray(list) ? list : [];
    },
    staleTime: STALE_TIME_MASTER_DATA,
  });

  return { branches, loadingBranches: isLoading, errorBranches: error, refetchBranches: refetch };
}

/**
 * Cached hook for hospital departments.
 */
export function useDepartments() {
  const { data: departments = [], isLoading, error, refetch } = useQuery<Department[]>({
    queryKey: ["master-departments"],
    queryFn: async () => {
      const res = await departmentApi.getAll();
      const list = res.data?.data || [];
      return Array.isArray(list) ? list : [];
    },
    staleTime: STALE_TIME_MASTER_DATA,
  });

  return { departments, loadingDepartments: isLoading, errorDepartments: error, refetchDepartments: refetch };
}

/**
 * Cached hook for doctors (optionally filtered by branch).
 */
export function useDoctors(branchId?: string, enabled = true) {
  const effectiveBranch = branchId && branchId !== "all" ? branchId : undefined;
  const { data: doctors = [], isLoading, error, refetch } = useQuery<EmployeeRecord[]>({
    queryKey: ["master-doctors", effectiveBranch || "all"],
    queryFn: async () => {
      const res = await employeeApi.getAll({
        roleType: "DOCTOR",
        branchId: effectiveBranch,
        limit: 1000,
      });
      const list = res.data?.data?.employees || [];
      return Array.isArray(list) ? list : [];
    },
    enabled,
    staleTime: STALE_TIME_DOCTORS,
  });

  return { doctors, loadingDoctors: isLoading, errorDoctors: error, refetchDoctors: refetch };
}

