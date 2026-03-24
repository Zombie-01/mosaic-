"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Group } from "react-konva";
import Konva from "konva";
import useImage from "use-image";
import { motion, AnimatePresence } from "motion/react";
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Info,
  Image as ImageIcon,
  Settings,
  X,
  Maximize,
} from "lucide-react";
import {
  getThumbnailUrl,
  getPreviewUrl,
  getHighResUrl,
  generateThumbnails,
  preloadImages,
  type ThumbnailSizes,
} from "../lib/imageUtils";

const TOTAL_WIDTH = 4000;
const TOTAL_HEIGHT = 2250; // 16:9

interface TileData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
  highResUrl: string;
  thumbnails?: ThumbnailSizes; // Optional thumbnails for uploaded images
}

const Tile = React.memo(
  ({
    tile,
    onClick,
    isFocused,
    isInteractive,
  }: {
    tile: TileData;
    onClick: (tile: TileData) => void;
    isFocused: boolean;
    isInteractive: boolean;
  }) => {
    // Progressive image loading: thumbnail -> preview -> high-res
    const [displayQuality, setDisplayQuality] = useState<
      "thumbnail" | "preview" | "highres"
    >("thumbnail");

    // Determine which url to use based on focus and quality level
    let imageUrl = tile.url;
    if (tile.thumbnails) {
      // Use thumbnail data for uploaded images
      if (isFocused) {
        imageUrl = tile.thumbnails.highres;
      } else if (displayQuality === "preview") {
        imageUrl = tile.thumbnails.preview;
      } else {
        imageUrl = tile.thumbnails.thumbnail;
      }
    } else {
      // For static images, just use the original URL
      imageUrl = tile.url;
    }

    const [image] = useImage(imageUrl, "anonymous");
    const [highResImage] = useImage(
      isFocused && tile.thumbnails ? tile.thumbnails.highres : "",
      "anonymous",
    );

    // Handle quality changes based on focus state
    useEffect(() => {
      if (isFocused) {
        setDisplayQuality("highres");
      } else if (tile.thumbnails) {
        // For uploaded images, start with thumbnail and upgrade to preview
        setDisplayQuality("thumbnail");
      } else {
        // For static images, always use highres
        setDisplayQuality("highres");
      }
    }, [isFocused, tile.thumbnails]);

    // Upgrade quality after a delay when tile is visible but not focused
    useEffect(() => {
      if (!isFocused && tile.thumbnails && !tile.url.startsWith("blob:")) {
        const timer = setTimeout(() => {
          setDisplayQuality("preview");
        }, 500);
        return () => clearTimeout(timer);
      }
    }, [isFocused, tile.url, tile.thumbnails]);

    return (
      <KonvaImage
        x={tile.x}
        y={tile.y}
        width={tile.width}
        height={tile.height}
        image={isFocused && highResImage ? highResImage : image}
        onClick={() => isInteractive && onClick(tile)}
        onTap={() => isInteractive && onClick(tile)}
        listening={isInteractive}
        perfectDrawEnabled={false}
        opacity={isFocused ? 1 : 0.7}
      />
    );
  },
);

export default function MosaicCanvas() {
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [stageSize, setStageSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
  });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [focusedTile, setFocusedTile] = useState<TileData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);
  const [smallImages, setSmallImages] = useState<ThumbnailSizes[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [masterImage] = useImage(masterImageUrl || "", "anonymous");

  useEffect(() => {
    const loadUploads = async () => {
      try {
        const response = await fetch("/api/uploads");
        if (!response.ok) return;
        const uploadedImages = (await response.json()) as ThumbnailSizes[];
        if (uploadedImages && uploadedImages.length > 0) {
          setSmallImages(uploadedImages);
          setIsReady(true);
        }
      } catch (error) {
        console.warn("Unable to load existing uploaded images", error);
      } finally {
        // set ready if no images were found
        setIsReady((prev) => prev || smallImages.length > 0);
      }
    };

    loadUploads();
  }, []);

  const gridSize = useMemo(() => {
    if (smallImages.length === 0) return 10; // Optimized default: 10x10 = 100 tiles
    // Calculate grid size based on count, between 8 and 30 for optimal performance
    const count = smallImages.length;
    const calculated = Math.floor(Math.sqrt(count));
    return Math.max(8, Math.min(calculated, 30));
  }, [smallImages]);

  const tileWidth = useMemo(() => TOTAL_WIDTH / gridSize, [gridSize]);
  const tileHeight = useMemo(() => TOTAL_HEIGHT / gridSize, [gridSize]);

  const stageRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const smallFilesInputRef = useRef<HTMLInputElement>(null);

  const masterImageProps = useMemo(() => {
    if (!masterImage) return null;

    const imgRatio = masterImage.width / masterImage.height;
    const gridRatio = TOTAL_WIDTH / TOTAL_HEIGHT;

    let width, height, x, y;

    if (imgRatio > gridRatio) {
      width = TOTAL_WIDTH;
      height = TOTAL_WIDTH / imgRatio;
    } else {
      height = TOTAL_HEIGHT;
      width = TOTAL_HEIGHT * imgRatio;
    }

    x = (TOTAL_WIDTH - width) / 2;
    y = (TOTAL_HEIGHT - height) / 2;

    return { x, y, width, height };
  }, [masterImage]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setMasterImageUrl(url);
    }
  };

  const handleSmallImagesUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      try {
        setIsReady(false);

        // Upload images and generate thumbnails
        const uploadPromises = Array.from(files).map(async (file) => {
          return await generateThumbnails(file);
        });

        const uploadedThumbnails = await Promise.all(uploadPromises);

        // Store the thumbnail data
        setSmallImages(uploadedThumbnails);
        setIsReady(true);
      } catch (error) {
        console.error("Failed to upload images:", error);
        setIsReady(true);
      } finally {
        // Clear the input
        if (smallFilesInputRef.current) {
          smallFilesInputRef.current.value = "";
        }
      }
    }
  };

  const toggleFullScreen = () => {
    if (typeof document !== "undefined") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.error(
            `Error attempting to enable full-screen mode: ${err.message}`,
          );
        });
      } else {
        document.exitFullscreen();
      }
    }
  };

  // Generate tiles
  useEffect(() => {
    if (smallImages.length === 0) {
      setTiles([]);
      setIsReady(true);
      return;
    }

    const newTiles: TileData[] = [];

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const id = i * gridSize + j;
        const imgIndex = id % smallImages.length;
        const thumbnailData = smallImages[imgIndex];

        newTiles.push({
          id,
          x: j * tileWidth,
          y: i * tileHeight,
          width: tileWidth,
          height: tileHeight,
          url: thumbnailData.thumbnail, // Start with thumbnail
          highResUrl: thumbnailData.highres,
          thumbnails: thumbnailData,
        });
      }
    }
    setTiles(newTiles);
    setIsReady(true);

    // Preload initial batch of thumbnail images for smooth viewing
    if (newTiles.length > 0) {
      const thumbsToPreload = newTiles
        .slice(0, Math.min(9, newTiles.length))
        .map((t) => (t.thumbnails ? t.thumbnails.thumbnail : t.url))
        .filter(Boolean);

      if (thumbsToPreload.length > 0) {
        preloadImages(thumbsToPreload).catch(() => {
          // Silently fail - images will load on demand
        });
      }
    }
  }, [smallImages, gridSize, tileWidth, tileHeight]);

  // Handle resize
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setStageSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Initial zoom to fit
  useEffect(() => {
    if (isReady) {
      const scaleX = stageSize.width / TOTAL_WIDTH;
      const scaleY = stageSize.height / TOTAL_HEIGHT;
      // Use min to fit the entire grid on screen (contain)
      const initialScale = Math.min(scaleX, scaleY);
      setScale(initialScale);
      setPosition({
        x: (stageSize.width - TOTAL_WIDTH * initialScale) / 2,
        y: (stageSize.height - TOTAL_HEIGHT * initialScale) / 2,
      });
    }
  }, [isReady, stageSize]);

  const handleTileClick = (tile: TileData) => {
    if (focusedTile?.id === tile.id) {
      // Zoom out
      setFocusedTile(null);
      const scaleX = stageSize.width / TOTAL_WIDTH;
      const scaleY = stageSize.height / TOTAL_HEIGHT;
      const initialScale = Math.min(scaleX, scaleY);

      animateTo(
        initialScale,
        (stageSize.width - TOTAL_WIDTH * initialScale) / 2,
        (stageSize.height - TOTAL_HEIGHT * initialScale) / 2,
      );
    } else {
      // Zoom in
      setFocusedTile(tile);
      // Calculate target scale to fit the tile nicely in the viewport
      const targetScale =
        Math.min(stageSize.width / tile.width, stageSize.height / tile.height) *
        0.8;
      const targetX =
        stageSize.width / 2 - (tile.x + tile.width / 2) * targetScale;
      const targetY =
        stageSize.height / 2 - (tile.y + tile.height / 2) * targetScale;

      animateTo(targetScale, targetX, targetY);
    }
  };

  const animateTo = (newScale: number, newX: number, newY: number) => {
    const stage = stageRef.current;
    if (!stage) return;

    stage.to({
      scaleX: newScale,
      scaleY: newScale,
      x: newX,
      y: newY,
      duration: 0.5,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        setScale(newScale);
        setPosition({ x: newX, y: newY });
      },
    });
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const speed = 1.1;
    const newScale = e.evt.deltaY < 0 ? oldScale * speed : oldScale / speed;

    const limitedScale = Math.max(0.05, Math.min(newScale, 20));

    const newPos = {
      x: pointer.x - mousePointTo.x * limitedScale,
      y: pointer.y - mousePointTo.y * limitedScale,
    };

    stage.scale({ x: limitedScale, y: limitedScale });
    stage.position(newPos);
    setScale(limitedScale);
    setPosition(newPos);
  };

  return (
    <div className="mosaic-root" style={{ position: "relative" }}>
      {!isReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white text-black">
          <div className="w-16 h-16 border-4 border-black/10 border-t-black rounded-full animate-spin mb-4"></div>
          <p className="text-sm tracking-widest uppercase opacity-60">
            Generating Mosaic...
          </p>
        </div>
      )}
      <Stage
        width={stageSize.width}
        height={stageSize.height}
        onWheel={handleWheel}
        draggable
        ref={stageRef}
        x={position.x}
        y={position.y}
        scaleX={scale}
        scaleY={scale}
        onDragMove={(e) => {
          setPosition({
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onDragEnd={(e) => {
          setPosition({
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        style={{ backgroundColor: "#ffffff", zIndex: 1 }}>
        <Layer>
          {tiles.map((tile) => (
            <Tile
              key={tile.id}
              tile={tile}
              onClick={handleTileClick}
              isFocused={focusedTile?.id === tile.id}
              isInteractive={scale > 0.5 || focusedTile?.id === tile.id} // Only interactive when zoomed in
            />
          ))}
          {/* Master Image Overlay - more prominent when zoomed out for logo recognition */}
          {masterImage && masterImageProps && (
            <KonvaImage
              image={masterImage}
              x={masterImageProps.x}
              y={masterImageProps.y}
              width={masterImageProps.width}
              height={masterImageProps.height}
              opacity={focusedTile ? 0 : Math.max(0.3, 0.9 - scale)} // Higher base opacity for logos
              listening={false}
              globalCompositeOperation="overlay"
            />
          )}
          {/* Subtle Multiply layer for better contrast in logo details */}
          {!focusedTile && masterImage && masterImageProps && (
            <KonvaImage
              image={masterImage}
              x={masterImageProps.x}
              y={masterImageProps.y}
              width={masterImageProps.width}
              height={masterImageProps.height}
              opacity={Math.max(0, 0.2 - scale)}
              listening={false}
              globalCompositeOperation="multiply"
            />
          )}
        </Layer>
      </Stage>

      {/* UI Overlays */}
      <div
        style={{ zIndex: 999999999999, top: 24, left: 24 }}
        className="absolute top-6 left-6 flex flex-col gap-4">
        <div className="bg-white/80 backdrop-blur-md border border-black/10 p-4 rounded-2xl text-black shadow-xl">
          <h1 className="text-2xl font-bold tracking-tight italic serif">
            Mosaic Explorer
          </h1>
          <p className="text-xs opacity-60 uppercase tracking-widest mt-1">
            Interactive Image Grid
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-3 bg-white/80 hover:bg-white backdrop-blur-md border border-black/10 rounded-xl text-black shadow-lg transition-all active:scale-95"
            title="Settings">
            <Settings size={20} />
          </button>
          <button
            onClick={toggleFullScreen}
            className="p-3 bg-white/80 hover:bg-white backdrop-blur-md border border-black/10 rounded-xl text-black shadow-lg transition-all active:scale-95"
            title="Full Scale">
            <Maximize size={20} />
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "20rem",
              height: "100%",
              zIndex: 999999999999,
              background: "#fff",
              borderRight: "1px solid rgba(0,0,0,0.1)",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              padding: "1.5rem",
              overflowY: "auto",
            }}>
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings size={20} />
                Settings
              </h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 hover:bg-black/5 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-8">
              {/* Big Image Upload */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-black/40 mb-4">
                  Master Image (Logo)
                </h3>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLogoUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black text-white rounded-xl text-sm font-medium transition-all hover:bg-black/80 active:scale-95">
                  <ImageIcon size={18} />
                  <span>Upload Big Image</span>
                </button>
                {masterImage && (
                  <div className="mt-3 w-full aspect-video rounded-lg overflow-hidden border border-black/10 bg-black/5 relative">
                    <img
                      src={masterImageUrl as string}
                      alt="Current Logo"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white rounded text-[8px] uppercase tracking-tighter">
                      Current Big Image
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-black/40 mt-2 italic">
                  This image defines the overall shape of the mosaic.
                </p>
              </section>

              {/* Small Images Upload */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-black/40 mb-4">
                  Tile Images (Small)
                </h3>
                <input
                  type="file"
                  ref={smallFilesInputRef}
                  onChange={handleSmallImagesUpload}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <button
                  onClick={() => smallFilesInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-black text-black rounded-xl text-sm font-medium transition-all hover:bg-black/5 active:scale-95">
                  <RefreshCw size={18} />
                  <span>Upload Small Images</span>
                </button>
                <div className="mt-2 text-[10px] text-black/60">
                  {smallImages.length > 0
                    ? `${smallImages.length} images loaded from /uploads`
                    : "No images uploaded"}
                </div>
                {smallImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-1">
                    {smallImages.slice(0, 8).map((thumb, i) => (
                      <div
                        key={i}
                        className="aspect-square rounded bg-black/5 overflow-hidden">
                        <img
                          src={thumb.thumbnail}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {smallImages.length > 8 && (
                      <div className="aspect-square rounded bg-black/5 flex items-center justify-center text-[10px] font-bold">
                        +{smallImages.length - 8}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-black/40 mt-2 italic">
                  Upload multiple images to be used as the mosaic tiles.
                </p>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        style={{ zIndex: 999999999999, bottom: 24, right: 24 }}
        className="absolute bottom-6  right-6 z-50 flex gap-2">
        <button
          onClick={() => {
            const initialScale = Math.min(
              stageSize.width / TOTAL_WIDTH,
              stageSize.height / TOTAL_HEIGHT,
            );
            animateTo(
              initialScale,
              (stageSize.width - TOTAL_WIDTH * initialScale) / 2,
              (stageSize.height - TOTAL_HEIGHT * initialScale) / 2,
            );
            setFocusedTile(null);
          }}
          className="p-3 bg-white/80 hover:bg-white backdrop-blur-md border border-black/10 rounded-full text-black shadow-lg transition-all active:scale-95"
          title="Reset View">
          <RefreshCw size={20} />
        </button>
        <div className="flex bg-white/80 backdrop-blur-md border border-black/10 rounded-full p-1 shadow-lg">
          <button
            onClick={() => animateTo(scale * 1.5, position.x, position.y)}
            className="p-2 hover:bg-black/5 rounded-full text-black transition-all">
            <ZoomIn size={20} />
          </button>
          <button
            onClick={() => animateTo(scale / 1.5, position.x, position.y)}
            className="p-2 hover:bg-black/5 rounded-full text-black transition-all">
            <ZoomOut size={20} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {focusedTile && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              position: "absolute",
              bottom: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 999999999999,
              background: "rgba(255, 255, 255, 0.8)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(0,0,0,0.1)",
              padding: "1rem",
              borderRadius: "1.5rem",
              color: "#000",
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
            }}
            className="text-black">
            <div className="w-20 aspect-video rounded-lg overflow-hidden border border-black/10">
              <img
                src={focusedTile.url}
                alt="Preview"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-sm font-medium">
                Focused Image #{focusedTile.id}
              </p>
              <p className="text-xs opacity-60">High resolution loaded</p>
            </div>
            <button
              onClick={() => handleTileClick(focusedTile)}
              className="ml-4 p-2 bg-black text-white rounded-full hover:bg-opacity-90 transition-all">
              <Minimize2 size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
