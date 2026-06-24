import axios from 'axios';
import type { Image, ListResponse, UploadResponse } from '../types';

const BASE = '/api';

const http = axios.create({ baseURL: BASE });

export async function fetchImages(status?: string): Promise<ListResponse> {
  const params = status ? { status } : {};
  const { data } = await http.get<ListResponse>('/images', { params });
  return data;
}

export async function fetchImage(id: string): Promise<Image> {
  const { data } = await http.get<Image>(`/images/${id}`);
  return data;
}

export async function uploadImage(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('image', file);

  const { data } = await http.post<UploadResponse>('/images', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (e.total && onProgress) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export async function deleteImage(id: string): Promise<void> {
  await http.delete(`/images/${id}`);
}
