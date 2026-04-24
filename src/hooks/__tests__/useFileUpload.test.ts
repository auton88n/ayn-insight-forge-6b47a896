import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileUpload } from '../useFileUpload';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { mockToast } from '@/test/mocks/contexts';

const mockSupabase = createMockSupabaseClient();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

const waitFor = async (callback: () => void, timeout = 1000) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      callback();
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  callback();
};

describe('useFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateFile', () => {
    it('should accept valid image types (jpeg, png, gif, webp)', () => {
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      
      validTypes.forEach(type => {
        const file = new File(['content'], 'test.jpg', { type });
        const { result } = renderHook(() => useFileUpload('test-user-id'));
        
        act(() => {
          result.current.handleFileSelect(file);
        });

        expect(result.current.selectedFile).toBe(file);
      });
    });

    it('should accept valid document types (pdf, doc, docx, txt, json)', () => {
      const validTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/json',
      ];
      
      validTypes.forEach(type => {
        const file = new File(['content'], 'test.pdf', { type });
        const { result } = renderHook(() => useFileUpload('test-user-id'));
        
        act(() => {
          result.current.handleFileSelect(file);
        });

        expect(result.current.selectedFile).toBe(file);
      });
    });

    it('should reject invalid file types with toast error', () => {
      const file = new File(['content'], 'test.exe', { type: 'application/x-msdownload' });
      const { result } = renderHook(() => useFileUpload('test-user-id'));
      
      act(() => {
        result.current.handleFileSelect(file);
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
      expect(result.current.selectedFile).toBeNull();
    });

    it('should reject files larger than 10MB with toast error', () => {
      const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', {
        type: 'application/pdf',
      });
      const { result } = renderHook(() => useFileUpload('test-user-id'));
      
      act(() => {
        result.current.handleFileSelect(largeFile);
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
      expect(result.current.selectedFile).toBeNull();
    });

    it('should accept files at exactly 10MB', () => {
      const file = new File(['x'.repeat(10 * 1024 * 1024)], 'test.pdf', {
        type: 'application/pdf',
      });
      const { result } = renderHook(() => useFileUpload('test-user-id'));
      
      act(() => {
        result.current.handleFileSelect(file);
      });

      expect(result.current.selectedFile).toBe(file);
    });
  });

  describe('uploadFile', () => {
    it('should refresh session if token is expiring soon', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      
      const expiringTime = Math.floor(Date.now() / 1000) + 200;
      mockSupabase._mocks.auth.getSession.mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'token',
            expires_at: expiringTime,
          },
        },
        error: null,
      });

      mockSupabase._mocks.auth.refreshSession.mockResolvedValueOnce({
        data: { session: { access_token: 'new_token' } },
        error: null,
      });

      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: { url: 'https://example.com/file.pdf' },
        error: null,
      });

      const { result } = renderHook(() => useFileUpload('test-user-id'));

      await act(async () => {
        await result.current.uploadFile(file);
      });

      expect(mockSupabase._mocks.auth.refreshSession).toHaveBeenCalled();
    });

    it('should call file-upload edge function with correct payload', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      
      mockSupabase._mocks.auth.getSession.mockResolvedValueOnce({
        data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
        error: null,
      });

      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: { url: 'https://example.com/file.pdf' },
        error: null,
      });

      const { result } = renderHook(() => useFileUpload('test-user-id'));

      await act(async () => {
        await result.current.uploadFile(file);
      });

      expect(mockSupabase._mocks.invoke).toHaveBeenCalledWith(
        'file-upload',
        expect.objectContaining({
          body: expect.objectContaining({
            filename: 'test.pdf',
            contentType: 'application/pdf',
          }),
        })
      );
    });

    it('should return FileAttachment object on success', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      
      mockSupabase._mocks.auth.getSession.mockResolvedValueOnce({
        data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
        error: null,
      });

      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: { url: 'https://example.com/uploads/test.pdf' },
        error: null,
      });

      const { result } = renderHook(() => useFileUpload('test-user-id'));

      let attachment;
      await act(async () => {
        attachment = await result.current.uploadFile(file);
      });

      expect(attachment).toEqual({
        url: 'https://example.com/uploads/test.pdf',
        name: 'test.pdf',
        type: 'application/pdf',
        size: file.size,
      });
    });

    it('should return null and show toast on error', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      
      mockSupabase._mocks.auth.getSession.mockResolvedValueOnce({
        data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
        error: null,
      });

      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: null,
        error: { message: 'Upload failed' },
      });

      const { result } = renderHook(() => useFileUpload('test-user-id'));

      let attachment;
      await act(async () => {
        attachment = await result.current.uploadFile(file);
      });

      expect(attachment).toBeNull();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
    });

    it('should set isUploading state during upload', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      
      mockSupabase._mocks.auth.getSession.mockResolvedValueOnce({
        data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
        error: null,
      });

      mockSupabase._mocks.invoke.mockImplementationOnce(
        () => new Promise(resolve => 
          setTimeout(() => resolve({ data: { url: 'https://example.com/file.pdf' }, error: null }), 100)
        )
      );

      const { result } = renderHook(() => useFileUpload('test-user-id'));

      act(() => {
        result.current.uploadFile(file);
      });

      await waitFor(() => {
        expect(result.current.isUploading).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.isUploading).toBe(false);
      }, 200);
    });
  });

  describe('drag and drop', () => {
    it('should set isDragOver on drag enter', () => {
      const { result } = renderHook(() => useFileUpload('test-user-id'));
      
      const event = new Event('dragenter') as any;
      event.preventDefault = vi.fn();
      event.stopPropagation = vi.fn();

      act(() => {
        result.current.handleDragEnter(event);
      });

      expect(result.current.isDragOver).toBe(true);
    });

    it('should clear isDragOver on drag leave', () => {
      const { result } = renderHook(() => useFileUpload('test-user-id'));
      
      const enterEvent = new Event('dragenter') as any;
      enterEvent.preventDefault = vi.fn();
      enterEvent.stopPropagation = vi.fn();

      act(() => {
        result.current.handleDragEnter(enterEvent);
      });

      const leaveEvent = new Event('dragleave') as any;
      leaveEvent.preventDefault = vi.fn();
      leaveEvent.stopPropagation = vi.fn();

      act(() => {
        result.current.handleDragLeave(leaveEvent);
      });

      expect(result.current.isDragOver).toBe(false);
    });

    it('should handle file drop correctly', () => {
      const { result } = renderHook(() => useFileUpload('test-user-id'));
      
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const dropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [file],
        },
      } as any;

      act(() => {
        result.current.handleDrop(dropEvent);
      });

      expect(result.current.selectedFile).toBe(file);
      expect(result.current.isDragOver).toBe(false);
    });

    it('should reject multiple file drops', () => {
      const { result } = renderHook(() => useFileUpload('test-user-id'));
      
      const file1 = new File(['content1'], 'test1.pdf', { type: 'application/pdf' });
      const file2 = new File(['content2'], 'test2.pdf', { type: 'application/pdf' });
      const dropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [file1, file2],
        },
      } as any;

      act(() => {
        result.current.handleDrop(dropEvent);
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
      expect(result.current.selectedFile).toBeNull();
    });
  });

  describe('file management', () => {
    it('should remove file when removeFile is called', () => {
      const { result } = renderHook(() => useFileUpload('test-user-id'));
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      
      act(() => {
        result.current.handleFileSelect(file);
      });

      expect(result.current.selectedFile).toBe(file);

      act(() => {
        result.current.removeFile();
      });

      expect(result.current.selectedFile).toBeNull();
    });
  });
});
