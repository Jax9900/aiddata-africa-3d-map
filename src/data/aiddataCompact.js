import { aiddataRowsPart1 } from "./aiddataRowsPart1";
import { aiddataRowsPart2 } from "./aiddataRowsPart2";
import { aiddataRowsPart3 } from "./aiddataRowsPart3";
import { aiddataRowsPart4 } from "./aiddataRowsPart4";
import { aiddataRowsPart5 } from "./aiddataRowsPart5";
import { aiddataRowsPart6 } from "./aiddataRowsPart6";
import { aiddataRowsPart7 } from "./aiddataRowsPart7";
import { aiddataRowsPart8 } from "./aiddataRowsPart8";
import { aidDataCountries, aidDataFinancierOrder, aidDataMeta, aidDataSectorOrder, aidDataYears } from "./aiddataMeta";

const compactAidData = {
  meta: aidDataMeta,
  years: aidDataYears,
  countries: aidDataCountries,
  sectorOrder: aidDataSectorOrder,
  financierOrder: aidDataFinancierOrder,
  rows: [...aiddataRowsPart1, ...aiddataRowsPart2, ...aiddataRowsPart3, ...aiddataRowsPart4, ...aiddataRowsPart5, ...aiddataRowsPart6, ...aiddataRowsPart7, ...aiddataRowsPart8],
};

export default compactAidData;
