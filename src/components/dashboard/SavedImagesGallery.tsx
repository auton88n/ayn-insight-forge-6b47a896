import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { 
  Images, 
  Loader2, 
  Download, 
  Trash2, 
  X, 
  ExternalLink,
  ImageOff,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface StorageImage {
  name: string;
  url: string;
  created_at: string;
}

interface SavedImagesGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SavedImagesGallery({ open, onOpenChange }: SavedImagesGalleryProps) {
  const [images, setImages] = useState<StorageImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<StorageImage | null>(null);
  const [deletingImage, setDeletingImage] = useState<string | null>(null);
  const { toast } = useToast();

  const loadImages = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('generated-images')
        .list('', {
          limit: 100,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        console.error('Error loading images:', error);
        toast({
          title: 'Error',
          description: 'Failed to load images',
          variant: 'destructive'
        });
        return;
      }

      // Filter for image files only and get public URLs
      const imageFiles = (data || [])
        .filter(file => file.name.match(/\.(png|jpg|jpeg|gif|webp)$/i))
        .map(file => {
          const { data: urlData } = supabase.storage
            .from('generated-images')
            .getPublicUrl(file.name);
          
          return {
            name: file.name,
            url: urlData.publicUrl,
            created_at: file.created_at || new Date().toISOString()
          };
        });

      setImages(imageFiles);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      loadImages();
    }
  }, [open, loadImages]);

  const handleDelete = async (imageName: string) => {
    setDeletingImage(imageName);
    try {
      const { error } = await supabase.storage
        .from('generated-images')
        .remove([imageName]);

      if (error) {
        throw error;
      }

      setImages(prev => prev.filter(img => img.name !== imageName));
      if (selectedImage?.name === imageName) {
        setSelectedImage(null);
      }
      
      toast({
        title: 'Deleted',
        description: 'Image removed from gallery'
      });
    } catch (err) {
      console.error('Delete error:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete image',
        variant: 'destructive'
      });
    } finally {
      setDeletingImage(null);
    }
  };

  const handleDownload = async (image: StorageImage) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = image.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
      toast({
        title: 'Error',
        description: 'Failed to download image',
        variant: 'destructive'
      });
    }
  };

  const handleDownloadImage = (image: StorageImage) => {
    handleDownload(image);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Unknown date';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        hideCloseButton
        className={cn(
          "flex flex-col p-0 gap-0",
          "w-[95vw] max-w-4xl h-[85vh] max-h-[85vh]",
          "bg-background",
          "overflow-hidden"
        )}
      >
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Images className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">Saved Images</DialogTitle>
                <DialogDescription className="sr-only">
                  View and manage your saved AI-generated images.
                </DialogDescription>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {images.length} image{images.length !== 1 ? 's' : ''} in gallery
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => loadImages()}
                disabled={isLoading}
                className="rounded-full"
              >
                <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="rounded-full hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Gallery Grid */}
          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : images.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                <ImageOff className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No images yet</h3>
                <p className="text-sm text-muted-foreground/70 mt-1 max-w-xs">
                  Images generated by AYN will automatically appear here
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {images.map((image) => (
                  <div
                    key={image.name}
                    className={cn(
                      "group relative aspect-square rounded-xl overflow-hidden",
                      "bg-muted/50 border border-border/40",
                      "cursor-pointer transition-all duration-200",
                      "hover:border-primary/40 hover:shadow-lg hover:scale-[1.02]",
                      selectedImage?.name === image.name && "ring-2 ring-primary"
                    )}
                    onClick={() => setSelectedImage(image)}
                  >
                    <img
                      src={image.url}
                      alt={image.name}
                      className="w-full h-full object-cover transition-opacity duration-300"
                      loading="lazy"
                      decoding="async"
                    />
                    
                    {/* Hover overlay */}
                    <div className={cn(
                      "absolute inset-0 bg-black/60 opacity-0",
                      "group-hover:opacity-100 transition-opacity",
                      "flex items-center justify-center gap-2"
                    )}>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(image);
                        }}
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(image.name);
                        }}
                        disabled={deletingImage === image.name}
                        title="Delete"
                      >
                        {deletingImage === image.name ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Selected Image Preview */}
          {selectedImage && (
            <div className="hidden lg:flex w-80 flex-col border-l border-border/40 bg-muted/20">
              <div className="flex-shrink-0 p-3 border-b border-border/40 flex items-center justify-between">
                <span className="text-sm font-medium">Preview</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  onClick={() => setSelectedImage(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="flex-1 p-4 flex flex-col">
                <div className="aspect-square rounded-xl overflow-hidden bg-background border border-border/40 mb-4">
                  <img
                    src={selectedImage.url}
                    alt={selectedImage.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Filename</p>
                    <p className="text-sm font-medium truncate">{selectedImage.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm">{formatDate(selectedImage.created_at)}</p>
                  </div>
                </div>

                  <div className="mt-auto pt-4 space-y-2">
                   <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleDownload(selectedImage)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => window.open(selectedImage.url, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => handleDelete(selectedImage.name)}
                    disabled={deletingImage === selectedImage.name}
                  >
                    {deletingImage === selectedImage.name ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
