import dayjs from 'dayjs';

export const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  return dayjs(iso).format('DD MMM YYYY, HH:mm');
};

export const nowIso = () => dayjs().toISOString();
