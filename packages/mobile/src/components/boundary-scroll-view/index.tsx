import React, {
  FunctionComponent,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {LayoutRectangle, ScrollView, ScrollViewProps, View} from 'react-native';
import {Box, BoxProps} from '../box';
import {BinarySortArray} from '../../common';

interface BoundaryScrollViewContextType {
  ref: React.RefObject<ScrollView>;
  layout: LayoutRectangle | null;
  scrollOffset: number;
}

const BoundaryScrollViewContext =
  React.createContext<BoundaryScrollViewContextType | null>(null);

export const BoundaryScrollView: FunctionComponent<ScrollViewProps> = ({
  children,
  ...scrollViewProps
}) => {
  const [layout, setLayout] = useState<LayoutRectangle | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const ref = useRef<ScrollView>(null);

  return (
    <ScrollView
      indicatorStyle="white"
      scrollEventThrottle={30}
      {...scrollViewProps}
      ref={ref}
      onLayout={e => {
        setLayout(e.nativeEvent.layout);
        if (scrollViewProps.onLayout) {
          scrollViewProps.onLayout(e);
        }
      }}
      onScroll={e => {
        setScrollOffset(e.nativeEvent.contentOffset.y);
        if (scrollViewProps.onScroll) {
          scrollViewProps.onScroll(e);
        }
      }}>
      <BoundaryScrollViewContext.Provider
        value={{
          layout,
          scrollOffset,
          ref,
        }}>
        {children}
      </BoundaryScrollViewContext.Provider>
    </ScrollView>
  );
};

export const BoundaryScrollViewBoundary: FunctionComponent<
  BoxProps & {
    itemHeight: number;
    items: React.ReactNode[];
    initialNumItemsToRender?: number;
    floodNumItemsToRender?: number;
    gap: number;
  }
> = ({
  items,
  itemHeight,
  initialNumItemsToRender = 14,
  floodNumItemsToRender = 6,
  gap,
  ...boxProps
}) => {
  const {
    layout,
    scrollOffset,
    ref: scrollViewRef,
  } = useBoundaryScrollViewInternal();
  const startPointRef = useRef<View | null>(null);

  const [renderIndex, setRenderIndex] = React.useState<[number, number]>([
    0,
    initialNumItemsToRender,
  ]);
  const [mockTopViewHeight, setMockTopViewHeight] = React.useState(0);
  const [mockBottomViewHeight, setMockBottomViewHeight] = React.useState(
    Math.max(
      0,
      (items.length - renderIndex[1]) * itemHeight +
        (items.length - renderIndex[1] - 1) * gap,
    ),
  );

  const itemsHeightRef = useRef(
    new BinarySortArray<{
      index: number;
      height: number;
    }>(
      (a, b) => {
        return a.index - b.index;
      },
      () => {
        // noop
      },
      () => {
        // noop
      },
    ),
  );
  const setItemHeight = (index: number, height: number) => {
    if (Math.abs(height - itemHeight) <= 0.1) {
      return;
    }
    const prev = itemsHeightRef.current.get(index.toString());
    if (prev != null && prev.height === height) {
      return;
    }
    itemsHeightRef.current.pushAndSort(index.toString(), {
      index,
      height,
    });

    if (index >= renderIndex[0] && index < renderIndex[1]) {
      setMockTopViewHeight(
        value => value + (height - (prev?.height ?? itemHeight)),
      );
    }
  };

  useEffect(() => {
    if (layout && scrollViewRef.current && startPointRef.current) {
      startPointRef.current.measureLayout(
        scrollViewRef.current.getScrollableNode(),
        (_left: number, top: number, _width: number, _height: number) => {
          const itemsHeightArr = itemsHeightRef.current.arr;
          const boundaryOffsetStartY = Math.max(0, scrollOffset);
          const boundaryOffsetEndY =
            Math.max(0, scrollOffset) + layout.height - top;
          let offset = 0;
          let prevOffset = 0;
          let differentHeightExists = false;
          let prevOffsetIndex = 0;
          let startIndex = -1;
          let endIndex = -1;
          for (const h of itemsHeightArr) {
            offset +=
              (h.index - prevOffsetIndex - (differentHeightExists ? 1 : 0)) *
              (itemHeight + gap);
            let d = h.height;
            if (h.index !== items.length - 1) {
              d += gap;
            }
            offset += d;
            differentHeightExists = true;

            if (startIndex < 0) {
              if (offset - d >= boundaryOffsetStartY) {
                if (offset - d <= boundaryOffsetStartY) {
                  startIndex = h.index;
                } else {
                  startIndex =
                    prevOffsetIndex +
                    Math.floor(
                      (boundaryOffsetStartY - prevOffset) / (itemHeight + gap),
                    );
                }
              }
            }
            if (endIndex < 0) {
              if (offset >= boundaryOffsetEndY) {
                if (offset - d <= boundaryOffsetEndY) {
                  endIndex = h.index + 1;
                } else {
                  endIndex =
                    prevOffsetIndex +
                    Math.ceil(
                      (boundaryOffsetEndY - prevOffset) / (itemHeight + gap),
                    );
                }
              }
            }

            prevOffset = offset;
            prevOffsetIndex = h.index;
          }
          if (startIndex < 0) {
            startIndex =
              prevOffsetIndex +
              Math.floor(
                (boundaryOffsetStartY - prevOffset) / (itemHeight + gap),
              );
          }
          if (endIndex < 0) {
            endIndex =
              prevOffsetIndex +
              Math.ceil((boundaryOffsetEndY - prevOffset) / (itemHeight + gap));
          }
          startIndex = Math.min(
            Math.max(startIndex - floodNumItemsToRender, 0),
            items.length - 1,
          );
          endIndex = Math.min(
            endIndex + floodNumItemsToRender + 1,
            items.length,
          );
          setRenderIndex([startIndex, endIndex]);

          let mockTopViewHeightDelta = 0;
          let mockBottomViewHeightDelta = 0;
          for (const h of itemsHeightArr) {
            if (h.index < startIndex) {
              mockTopViewHeightDelta += h.height - itemHeight;
            } else if (h.index >= endIndex) {
              mockBottomViewHeightDelta += h.height - itemHeight;
            }
          }
          setMockTopViewHeight(
            mockTopViewHeightDelta + startIndex * (itemHeight + gap),
          );
          setMockBottomViewHeight(
            Math.max(
              0,
              mockBottomViewHeightDelta +
                ((items.length - endIndex) * itemHeight +
                  (items.length - endIndex - 1) * gap),
            ),
          );
        },
      );
    }
  }, [
    layout,
    scrollViewRef,
    scrollOffset,
    floodNumItemsToRender,
    itemHeight,
    gap,
    items.length,
  ]);

  const itemsRenderIndexKey = useRef(0);
  itemsRenderIndexKey.current = 0;
  return (
    <React.Fragment>
      <View ref={startPointRef} />
      <Box {...boxProps}>
        <View
          style={{
            height: mockTopViewHeight,
          }}
        />
        {items.map((item, index) => {
          if (index >= renderIndex[0] && index < renderIndex[1]) {
            const key = itemsRenderIndexKey.current;
            itemsRenderIndexKey.current++;
            return (
              <React.Fragment key={key}>
                <View
                  onLayout={e => {
                    setItemHeight(index, e.nativeEvent.layout.height);
                  }}>
                  {item}
                </View>
                {index !== items.length - 1 ? (
                  <View style={{height: gap}} />
                ) : null}
              </React.Fragment>
            );
          }
          return null;
        })}
        <View
          style={{
            height: mockBottomViewHeight,
          }}
        />
      </Box>
    </React.Fragment>
  );
};

export const useBoundaryScrollViewInternal = () => {
  const context = useContext(BoundaryScrollViewContext);
  if (!context) {
    throw new Error(
      'You must use `BoundaryScrollViewBoundary` under `BoundaryScrollView`',
    );
  }
  return context;
};