import { DateArg, format } from "date-fns";

export const formatDateShort = (date: DateArg<Date> & {}) =>
  format(date, "dd MMM yyyy HH:mm");

export const formatDateLong = (date: DateArg<Date> & {}) =>
  format(date, "EEEE, dd MMMM yyyy, HH:mm");
