// mm-virtual-display: creates a virtual monitor (the phone as a second screen) until stdin closes.
//   usage: mm-virtual-display <width> <height> [refreshHz] [name] [hidpi 0|1] [right|left|below]
//   prints one JSON line {"displayId":N,"width":W,"height":H} once the display exists, then waits.
// Uses CoreGraphics' private CGVirtualDisplay API (macOS 11+), the same one DeskPad and
// BetterDisplay use. Not public: Apple may change it, so failures are reported, never fatal.
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>

@interface CGVirtualDisplayDescriptor : NSObject
@property(retain, nonatomic) dispatch_queue_t queue;
@property(retain, nonatomic) NSString *name;
@property(nonatomic) unsigned int maxPixelsWide;
@property(nonatomic) unsigned int maxPixelsHigh;
@property(nonatomic) CGSize sizeInMillimeters;
@property(nonatomic) unsigned int productID;
@property(nonatomic) unsigned int vendorID;
@property(nonatomic) unsigned int serialNum;
@property(copy, nonatomic) void (^terminationHandler)(id, id);
@end

@interface CGVirtualDisplayMode : NSObject
- (instancetype)initWithWidth:(unsigned int)width height:(unsigned int)height refreshRate:(double)refreshRate;
@end

@interface CGVirtualDisplaySettings : NSObject
@property(retain, nonatomic) NSArray *modes;
@property(nonatomic) unsigned int hiDPI;
@end

@interface CGVirtualDisplay : NSObject
@property(readonly, nonatomic) unsigned int displayID;
- (instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor *)descriptor;
- (BOOL)applySettings:(CGVirtualDisplaySettings *)settings;
@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 3) {
      fprintf(stderr, "usage: %s <width> <height> [refreshHz] [name] [hidpi]\n", argv[0]);
      return 2;
    }
    unsigned int w = (unsigned int)atoi(argv[1]), h = (unsigned int)atoi(argv[2]);
    double hz = argc > 3 ? atof(argv[3]) : 60;
    NSString *name = argc > 4 ? [NSString stringWithUTF8String:argv[4]] : @"Mob Mirror Display";
    unsigned int hidpi = argc > 5 ? (unsigned int)atoi(argv[5]) : 1;
    const char *side = argc > 6 ? argv[6] : "right";
    if (!NSClassFromString(@"CGVirtualDisplay")) {
      printf("{\"error\":\"CGVirtualDisplay is not available on this macOS\"}\n");
      fflush(stdout);
      return 1;
    }

    CGVirtualDisplayDescriptor *d = [[NSClassFromString(@"CGVirtualDisplayDescriptor") alloc] init];
    d.queue = dispatch_get_main_queue();
    d.name = name;
    // With hiDPI the backing store is 2x the "looks like" size.
    d.maxPixelsWide = w * (hidpi ? 2 : 1);
    d.maxPixelsHigh = h * (hidpi ? 2 : 1);
    d.sizeInMillimeters = CGSizeMake(w * 25.4 / 160.0, h * 25.4 / 160.0); // ~160 dpi panel
    d.productID = 0x4D4D;  // "MM"
    d.vendorID = 0x4D4D;
    d.serialNum = 1;
    d.terminationHandler = ^(id a, id b) {
      printf("{\"terminated\":true}\n");
      fflush(stdout);
      exit(0);
    };

    CGVirtualDisplay *display = [[NSClassFromString(@"CGVirtualDisplay") alloc] initWithDescriptor:d];
    if (!display || display.displayID == 0) {
      printf("{\"error\":\"macOS refused to create the virtual display\"}\n");
      fflush(stdout);
      return 1;
    }
    CGVirtualDisplaySettings *s = [[NSClassFromString(@"CGVirtualDisplaySettings") alloc] init];
    s.hiDPI = hidpi;
    s.modes = @[ [[NSClassFromString(@"CGVirtualDisplayMode") alloc] initWithWidth:w height:h refreshRate:hz] ];
    if (![display applySettings:s]) {
      printf("{\"error\":\"macOS rejected the display mode %ux%u\"}\n", w, h);
      fflush(stdout);
      return 1;
    }
    // Place it next to the main screen, centred along the shared edge, so the pointer crosses
    // anywhere on that edge (macOS otherwise top-aligns it, leaving most of the edge a wall).
    // Public API; the user can still rearrange it in System Settings → Displays.
    CGRect mainB = CGDisplayBounds(CGMainDisplayID());
    int32_t x, y;
    if (strcmp(side, "left") == 0) {
      x = (int32_t)(mainB.origin.x - w);
      y = (int32_t)(mainB.origin.y + (mainB.size.height - h) / 2);
    } else if (strcmp(side, "below") == 0) {
      x = (int32_t)(mainB.origin.x + (mainB.size.width - w) / 2);
      y = (int32_t)(mainB.origin.y + mainB.size.height);
    } else {
      x = (int32_t)(mainB.origin.x + mainB.size.width);
      y = (int32_t)(mainB.origin.y + (mainB.size.height - h) / 2);
    }
    // The new display takes a moment to become configurable.
    for (int i = 0; i < 20; i++) {
      CGDisplayConfigRef cfg;
      if (CGBeginDisplayConfiguration(&cfg) == kCGErrorSuccess) {
        CGConfigureDisplayOrigin(cfg, display.displayID, x, y);
        if (CGCompleteDisplayConfiguration(cfg, kCGConfigureForSession) == kCGErrorSuccess) {
          CGRect nb = CGDisplayBounds(display.displayID);
          if ((int32_t)nb.origin.x == x && (int32_t)nb.origin.y == y) break;
        }
      }
      [NSThread sleepForTimeInterval:0.1];
    }
    CGRect at = CGDisplayBounds(display.displayID);
    printf("{\"displayId\":%u,\"width\":%u,\"height\":%u,\"x\":%d,\"y\":%d}\n", display.displayID, w, h, (int)at.origin.x, (int)at.origin.y);
    fflush(stdout);

    // Live until the parent (Mob Mirror) closes stdin or dies: then the display disappears.
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
      char buf[64];
      while (fgets(buf, sizeof buf, stdin)) {
      }
      exit(0);
    });
    [[NSRunLoop mainRunLoop] run];
  }
  return 0;
}
