import API from "./axios";
import { LabTestParameterRecord } from "./labOrder.api";
export type { LabTestParameterRecord };

export interface LabTestCategoryRecord {
  id: string;
  lab_test_category_id: string;
  category_name: string;
  category_code: string | null;
  description: string | null;
  display_order: number | null;
  category_status: number | null;
}

export interface LabTestMasterRecord {
  id: string;
  lab_test_id: string;
  lab_test_category_id: string;
  test_name: string;
  test_code: string;
  sample_type: string | null;
  required_volume: string | null;
  unit: string | null;
  reference_range: string | null;
  price: number | string | null;
  tat_hours: number | null;
  test_status: number | null;
  branch_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  lab_test_category?: LabTestCategoryRecord | null;
  lab_test_parameter?: LabTestParameterRecord[];
}

export const labTestMasterApi = {
  getAll: () =>
    API.get<{ success: boolean; data: LabTestMasterRecord[] }>(
      "/lab-test-master",
    ),

  getById: (labTestId: string) =>
    API.get<{ success: boolean; data: LabTestMasterRecord }>(
      `/lab-test-master/${labTestId}`,
    ),

  getParameters: () =>
    API.get<{ success: boolean; data: LabTestParameterRecord[] }>(
      "/lab-test-master/parameters",
    ),
};
