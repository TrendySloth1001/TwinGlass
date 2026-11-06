// mm-input: turns phone touches into Mac mouse events (public CoreGraphics CGEvent API).
// Reads one JSON object per line on stdin; coordinates are normalised 0..1 over the shared display.
//   {"t":"display","id":4}                 which display the phone shows (CGDirectDisplayID)
//   {"t":"move","x":0.5,"y":0.5}           pointer move (no button)
//   {"t":"down","x":..,"y":..,"b":0|1}     button down (0 left, 1 right)
//   {"t":"drag","x":..,"y":..}             move with the left button held
//   {"t":"up","x":..,"y":..,"b":0|1}       button up
//   {"t":"scroll","dx":0,"dy":-3}          scroll, in lines
// Prints {"trusted":true|false} at start: posting events needs the Accessibility permission.
#import <ApplicationServices/ApplicationServices.h>
#import <Foundation/Foundation.h>

static CGDirectDisplayID display = 0;

static CGPoint toScreen(double nx, double ny) {
  CGRect b = CGDisplayBounds(display ? display : CGMainDisplayID());
  nx = nx < 0 ? 0 : nx > 1 ? 1 : nx;
  ny = ny < 0 ? 0 : ny > 1 ? 1 : ny;
  return CGPointMake(b.origin.x + nx * (b.size.width - 1), b.origin.y + ny * (b.size.height - 1));
}

static void post(CGEventType type, CGPoint p, CGMouseButton button, int clicks) {
  CGEventRef e = CGEventCreateMouseEvent(NULL, type, p, button);
  if (clicks > 1) CGEventSetIntegerValueField(e, kCGMouseEventClickState, clicks);
  CGEventPost(kCGHIDEventTap, e);
  CFRelease(e);
}

int main(void) {
  @autoreleasepool {
    // Ask macOS to show the Accessibility prompt if this app isn't trusted yet.
    NSDictionary *opts = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt : @YES};
    BOOL trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)opts);
    printf("{\"trusted\":%s}\n", trusted ? "true" : "false");
    fflush(stdout);

    char line[512];
    NSTimeInterval lastDown = 0;
    CGPoint lastDownAt = CGPointZero;
    int clicks = 1;
    while (fgets(line, sizeof line, stdin)) {
      NSData *data = [NSData dataWithBytes:line length:strlen(line)];
      NSDictionary *m = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      if (![m isKindOfClass:[NSDictionary class]]) continue;
      NSString *t = m[@"t"];
      CGPoint p = toScreen([m[@"x"] doubleValue], [m[@"y"] doubleValue]);
      int b = [m[@"b"] intValue];
      if ([t isEqualToString:@"display"]) {
        display = (CGDirectDisplayID)[m[@"id"] unsignedIntValue];
      } else if ([t isEqualToString:@"move"]) {
        post(kCGEventMouseMoved, p, kCGMouseButtonLeft, 1);
      } else if ([t isEqualToString:@"down"]) {
        // Double-click: a second press soon after, near the first (what macOS expects in clickState).
        NSTimeInterval now = [NSDate timeIntervalSinceReferenceDate];
        clicks = (now - lastDown < 0.35 && fabs(p.x - lastDownAt.x) < 8 && fabs(p.y - lastDownAt.y) < 8) ? clicks + 1 : 1;
        lastDown = now;
        lastDownAt = p;
        post(kCGEventMouseMoved, p, kCGMouseButtonLeft, 1);
        post(b ? kCGEventRightMouseDown : kCGEventLeftMouseDown, p, b ? kCGMouseButtonRight : kCGMouseButtonLeft, clicks);
      } else if ([t isEqualToString:@"drag"]) {
        post(kCGEventLeftMouseDragged, p, kCGMouseButtonLeft, 1);
      } else if ([t isEqualToString:@"up"]) {
        post(b ? kCGEventRightMouseUp : kCGEventLeftMouseUp, p, b ? kCGMouseButtonRight : kCGMouseButtonLeft, clicks);
      } else if ([t isEqualToString:@"scroll"]) {
        CGEventRef e = CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitPixel, 2, (int32_t)[m[@"dy"] intValue],
                                                     (int32_t)[m[@"dx"] intValue]);
        CGEventPost(kCGHIDEventTap, e);
        CFRelease(e);
      }
    }
  }
  return 0;
}
