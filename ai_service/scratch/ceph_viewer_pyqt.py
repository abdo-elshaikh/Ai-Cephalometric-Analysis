import sys
import io
import numpy as np
from PyQt6.QtWidgets import (QApplication, QMainWindow, QGraphicsView, QGraphicsScene, 
                             QGraphicsPixmapItem, QGraphicsEllipseItem, QVBoxLayout, 
                             QHBoxLayout, QWidget, QLabel, QFileDialog, QPushButton)
from PyQt6.QtGui import QPixmap, QImage, QColor, QPen, QBrush
from PyQt6.QtCore import Qt, QPointF

class LandmarkItem(QGraphicsEllipseItem):
    def __init__(self, x, y, name, color=Qt.GlobalColor.green):
        r = 6
        super().__init__(-r, -r, 2*r, 2*r)
        self.setPos(x, y)
        self.setBrush(QBrush(color))
        self.setPen(QPen(Qt.GlobalColor.black, 1))
        self.setFlag(QGraphicsEllipseItem.GraphicsItemFlag.ItemIsMovable)
        self.setFlag(QGraphicsEllipseItem.GraphicsItemFlag.ItemSendsGeometryChanges)
        self.name = name
        self.setToolTip(name)

    def itemChange(self, change, value):
        if change == QGraphicsEllipseItem.GraphicsItemChange.ItemPositionChange:
            # print(f"Landmark {self.name} moved to {value.x()}, {value.y()}")
            pass
        return super().itemChange(change, value)

class CephViewer(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AI Ceph Professional Tracing Tool (PyQt6)")
        self.resize(1200, 900)

        # UI Layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QHBoxLayout(central_widget)

        # Viewer
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene)
        self.view.setRenderHint(Qt.TransformationHint.SmoothTransformation)
        layout.addWidget(self.view, stretch=4)

        # Sidebar
        sidebar = QWidget()
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar.setFixedWidth(250)
        
        self.info_label = QLabel("Professional AI Tracing Tool\nStatus: Ready")
        self.info_label.setStyleSheet("font-weight: bold; color: #059669;")
        sidebar_layout.addWidget(self.info_label)
        
        self.load_btn = QPushButton("Load X-Ray")
        self.load_btn.clicked.connect(self.load_image)
        sidebar_layout.addWidget(self.load_btn)
        
        self.analyze_btn = QPushButton("Run AI Analysis")
        self.analyze_btn.setEnabled(False)
        sidebar_layout.addWidget(self.analyze_btn)

        sidebar_layout.addStretch()
        layout.addWidget(sidebar, stretch=1)

        self.setStyleSheet("""
            QMainWindow { background-color: #f3f4f6; }
            QPushButton { 
                background-color: #059669; color: white; border-radius: 5px; padding: 10px; font-weight: bold;
            }
            QPushButton:disabled { background-color: #9ca3af; }
            QLabel { color: #374151; }
        """)

    def load_image(self):
        file_path, _ = QFileDialog.getOpenFileName(self, "Open Cephalometric X-Ray", "", "Images (*.png *.jpg *.jpeg *.dcm)")
        if file_path:
            pixmap = QPixmap(file_path)
            self.scene.clear()
            self.pixmap_item = QGraphicsPixmapItem(pixmap)
            self.scene.addItem(self.pixmap_item)
            self.view.fitInView(self.pixmap_item, Qt.AspectRatioMode.KeepAspectRatio)
            
            # Add some demo landmarks
            self.add_landmark(pixmap.width()*0.5, pixmap.height()*0.3, "Sella (S)")
            self.add_landmark(pixmap.width()*0.7, pixmap.height()*0.28, "Nasion (N)")
            self.add_landmark(pixmap.width()*0.7, pixmap.height()*0.5, "Point A")
            
            self.info_label.setText(f"Loaded: {file_path.split('/')[-1]}")
            self.analyze_btn.setEnabled(True)

    def add_landmark(self, x, y, name):
        item = LandmarkItem(x, y, name)
        self.scene.addItem(item)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = CephViewer()
    window.show()
    sys.exit(app.exec())
