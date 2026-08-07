#import <Cocoa/Cocoa.h>
int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSString *iconPath = [NSString stringWithUTF8String:argv[1]];
        NSString *filePath = [NSString stringWithUTF8String:argv[2]];
        NSImage *icon = [[NSImage alloc] initWithContentsOfFile:iconPath];
        BOOL result = [[NSWorkspace sharedWorkspace] setIcon:icon forFile:filePath options:0];
        return result ? 0 : 1;
    }
}