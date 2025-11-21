import React, { useState, useRef } from "react";
import { ConfigProvider, Layout, InputNumber, Button, Space, List, Card, Typography, Row, Col, Form, Input, Table, Popconfirm, Modal, Switch, Select } from "antd";
import { UndoOutlined, PlusOutlined, DeleteOutlined, CaretRightOutlined } from "@ant-design/icons";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

// Clockwise order starting at top (20)
const SECTORS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];

type Player = {
  id: string;
  name: string;
  score: number;
  history: Array<{ desc: string; delta: number }>; // most recent first
};

type LastHit = {
  svgX: number;
  svgY: number;
  distSvg: number;
  atanDeg: number;
  angleFromTop: number;
  sectorIndex: number;
  sectorNumber: number | null;
  mult: number;
  rawScore: number;
};

export default function DartsManagerApp(){
  const [startingScore, setStartingScore] = useState<number>(501);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [nextId, setNextId] = useState(1);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [lastHit, setLastHit] = useState<LastHit | null>(null);

  function addPlayer(name: string){
    const p: Player = { id: String(nextId), name: name || `Игрок: ${nextId}`, score: startingScore, history: [] };
    setNextId(n=>n+1);
    setPlayers(prev=>[...prev, p]);
    setShowAddPlayer(false);
  }

  function resetGame(){
    setPlayers(p=>p.map(pl=>({ ...pl, score: startingScore, history: [] })));
    setActivePlayerIndex(0);
    setIsRunning(false);
    setLastHit(null);
  }

  function removePlayer(id: string){
    setPlayers(prev=>prev.filter(p=>p.id!==id));
    setActivePlayerIndex(0);
  }

  function recordHit(playerIndex: number, label: string | number, multiplier: number, rawScore: number){
    setPlayers(prev=>{
      const copy = [...prev];
      const pl = { ...copy[playerIndex] };
      const desc = typeof label === 'number' ? `${multiplier}×${label}` : `${label}`;
      const delta = -rawScore;
      pl.score = pl.score + delta;
      pl.history = [{ desc, delta }, ...pl.history];
      copy[playerIndex] = pl;
      return copy;
    });
  }

  function undoLast(playerIndex: number){
    setPlayers(prev=>{
      const copy = [...prev];
      const pl = { ...copy[playerIndex] };
      const last = pl.history[0];
      if(!last) return prev;
      pl.score = pl.score - last.delta;
      pl.history = pl.history.slice(1);
      copy[playerIndex] = pl;
      return copy;
    });
  }

  function nextTurn(){
    setActivePlayerIndex(i=> (players.length===0 ? 0 : (i+1) % players.length));
  }

  // Dartboard reference (SVG coords radius = 50)
  const SVG_RADIUS = 50;
  const BOARD_OUTER = 48; // rim
  // Increased and adjusted ring radii (SVG units) so drawn rings match hit areas better
  const DOUBLE_OUTER = 44;
  const DOUBLE_INNER = 38;
  const TRIPLE_OUTER = 28;
  const TRIPLE_INNER = 23;
  const OUTER_BULL_R = 10;
  const INNER_BULL_R = 5;

  const boardRef = useRef<HTMLDivElement | null>(null);

  // --- Hit handling: use pixel-based radii and an angle->sector mapping that picks the nearest sector center ---
  function onBoardClick(e: React.MouseEvent){
    if(players.length===0) return;
    const el = boardRef.current;
    if(!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const x = e.clientX - cx; // screen coords, origin at center, x positive to right
    const y = e.clientY - cy; // screen coords, origin at center, y positive down
    const distPx = Math.hypot(x,y);
    const Rpx = rect.width/2; // pixel radius

    // Pixel-based ring boundaries: map SVG ring radii into pixels so hit areas follow the drawn rings exactly
    const innerBullR_px = Rpx * (INNER_BULL_R / SVG_RADIUS);
    const outerBullR_px = Rpx * (OUTER_BULL_R / SVG_RADIUS);
    const tripleOuter_px = Rpx * (TRIPLE_OUTER / SVG_RADIUS);
    const tripleInner_px = Rpx * (TRIPLE_INNER / SVG_RADIUS);
    const doubleOuter_px = Rpx * (DOUBLE_OUTER / SVG_RADIUS);
    const doubleInner_px = Rpx * (DOUBLE_INNER / SVG_RADIUS);

    // Bulls detection using pixel radii
    if(distPx <= innerBullR_px){
      const distSvg = distPx / Rpx * SVG_RADIUS;
      recordHit(activePlayerIndex, 'Яблочко (50)', 1, 50);
      setLastHit(makeLastHit(distSvg, x, y, 50, 1, 50));
      return;
    }
    if(distPx <= outerBullR_px){
      const distSvg = distPx / Rpx * SVG_RADIUS;
      recordHit(activePlayerIndex, 'Внешний центр (25)', 1, 25);
      setLastHit(makeLastHit(distSvg, x, y, 25, 1, 25));
      return;
    }

    // Compute angle as used in drawing: atan2(y, x) with y positive down -> degrees where 0 is +x and increases clockwise
    const atanDeg = Math.atan2(y, x) * 180 / Math.PI; // -180..180
    // Convert to angle from top (0 at top, clockwise): same as earlier working formula
    const angleFromTop = (atanDeg + 90 + 360) % 360; // 0..360

    // Instead of relying on floor which can be sensitive at boundaries, pick the nearest sector center.
    // Sector centers (degrees from top) are at 0,18,36,...,342 for sectors array indices 0..19.
    const sectorFloat = angleFromTop / 18; // 0..20
    const sectorIndex = Math.round(sectorFloat) % 20; // nearest sector
    const sectorNumber = SECTORS[sectorIndex];

    // Determine multiplier using pixel-based ring boundaries
    let mult = 1;
    if(distPx >= tripleInner_px && distPx <= tripleOuter_px) mult = 3;
    else if(distPx >= doubleInner_px && distPx <= doubleOuter_px) mult = 2;

    const rawScore = sectorNumber * mult;
    recordHit(activePlayerIndex, sectorNumber, mult, rawScore);

    const distSvg = distPx / Rpx * SVG_RADIUS;
    setLastHit(makeLastHit(distSvg, x, y, sectorNumber, mult, rawScore, atanDeg, angleFromTop, sectorIndex));
  }

  function makeLastHit(distSvg: number, x: number, y: number, sectorNumber: number | string, mult: number, rawScore: number, atanDeg?: number, angleFromTop?: number, sectorIndex?: number): LastHit{
    const atanDegVal = (typeof atanDeg === 'number') ? atanDeg : (Math.atan2(y, x) * 180 / Math.PI);
    const angleFromTopVal = (typeof angleFromTop === 'number') ? angleFromTop : ((atanDegVal + 90 + 360) % 360);

    // To map distSvg and angleFromTopVal into SVG coordinates (0..100 space), convert angleFromTop to math theta
    // angleFromTop: 0 at top, clockwise positive. SVG math theta (radians) we want 0 at right (+x) and CCW positive.
    // Convert: theta = (90 - angleFromTop) degrees converted to radians
    const thetaRad = (90 - angleFromTopVal) * Math.PI / 180;
    const svgX = 50 + distSvg * Math.cos(thetaRad);
    const svgY = 50 - distSvg * Math.sin(thetaRad); // minus because SVG y increases downwards

    return {
      svgX,
      svgY,
      distSvg,
      atanDeg: Number(atanDegVal.toFixed(2)),
      angleFromTop: Number(angleFromTopVal.toFixed(2)),
      sectorIndex: sectorIndex ?? Math.round(angleFromTopVal / 18) % 20,
      sectorNumber: typeof sectorNumber === 'number' ? sectorNumber : null,
      mult,
      rawScore
    };
  }

  const columns = [
    { title: 'Player', dataIndex: 'name', key: 'name', render: (text: string, record: Player, index: number) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Text strong>{text}</Text>
        {activePlayerIndex===index && <Text type="success">(Ходит)</Text>}
      </div>
    ) },
    { title: 'Score', dataIndex: 'score', key: 'score', render: (n: number) => <Text strong>{n}</Text> },
    { title: 'Actions', key: 'actions', render: (_: any, record: Player, index: number) => (
      <Space>
        <Button onClick={()=>setActivePlayerIndex(index)} size="small">Передать ход</Button>
        <Button onClick={()=>undoLast(index)} icon={<UndoOutlined />} size="small">Отменить</Button>
        <Popconfirm title="Удалить игрока?" onConfirm={()=>removePlayer(record.id)}>
          <Button danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      </Space>
    ) }
  ];

  // Manual hit input state
  const [manualSector, setManualSector] = useState<number | 'BULL' | 'OB'>('BULL');
  const [manualMult, setManualMult] = useState<number>(1);

  function applyManualHit(){
    if(players.length===0) return;
    if(manualSector === 'BULL'){
      recordHit(activePlayerIndex, 'Яблочко (50)', 1, 50);
      const distSvg = INNER_BULL_R;
      setLastHit(makeLastHit(distSvg, 0, -distSvg, 50, 1, 50));
      return;
    }
    if(manualSector === 'OB'){
      recordHit(activePlayerIndex, 'Внешний центр (25)', 1, 25);
      const distSvg = OUTER_BULL_R;
      setLastHit(makeLastHit(distSvg, 0, -distSvg, 25, 1, 25));
      return;
    }
    const sectorNumber = Number(manualSector);
    const raw = sectorNumber * manualMult;
    recordHit(activePlayerIndex, sectorNumber, manualMult, raw);
    setLastHit(makeLastHit(TRIPLE_OUTER, 0, -TRIPLE_OUTER, sectorNumber, manualMult, raw));
  }

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#0f60d9' } }}>
      <Layout style={{ minHeight: '97vh' }}>
        <Header style={{ background: '#fff', borderBottom: '1px solid #eee' }}>
          <Title level={3} style={{ margin: 0, color: '#0f60d9' }}>im.darts</Title>
        </Header>
        <Content style={{ padding: 16 }}>
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Card style={{ marginBottom: 12 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <div>
                    <Text>Начальный счёт</Text>
                    <InputNumber min={1} max={10000} value={startingScore} onChange={(v)=>setStartingScore(Number(v||0))} style={{ marginLeft: 8 }} />
                    <Button style={{ marginLeft: 8 }} onClick={resetGame}>Сбросить счёт</Button>
                  </div>
                  <div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={()=>setShowAddPlayer(true)}>Добавить игрока</Button>
                    <Button style={{ marginLeft: 8 }} onClick={()=>setIsRunning(r=>!r)}>{isRunning ? 'На перерыв' : 'Начать'}</Button>
                    <Button style={{ marginLeft: 8 }} icon={<CaretRightOutlined />} onClick={nextTurn}>Следующий ход</Button>
                  </div>
                </Space>
              </Card>

              <Card title="Игроки и счёт">
                <Table pagination={false} dataSource={players} columns={columns as any} rowKey={r=>r.id} />
              </Card>

              <Card title="История ходов" style={{ marginTop: 12 }}>
                {players[activePlayerIndex] ? (
                  <div>
                    <Title level={5}>{players[activePlayerIndex].name} — {players[activePlayerIndex].score}</Title>
                    <List size="small" dataSource={players[activePlayerIndex].history} renderItem={item => (
                      <List.Item>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <div>{item.desc}</div>
                          <div>{item.delta}</div>
                        </div>
                      </List.Item>
                    )} />
                  </div>
                ) : <Text type="secondary">Пока пусто — время кинуть дротик.</Text>}
              </Card>

            </Col>

            <Col xs={24} lg={12}>
              <Card title={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span>Доска (клик для ввода броска)</span><span><Text>Отладка</Text><Switch checked={showDebug} onChange={(v)=>setShowDebug(v)} style={{ marginLeft: 8 }} /></span></div>} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div ref={boardRef} onClick={onBoardClick} style={{ width: '100%', maxWidth: 460, aspectRatio: '1 / 1', cursor: 'crosshair', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 12 }}>
                  <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    <circle cx="50" cy="50" r="50" fill="#fafafa" stroke="#222" />
                    {SECTORS.map((num, i)=>{
                      const startAngle = (i * 18 - 99) * Math.PI/180;
                      const endAngle = ((i+1) * 18 - 99) * Math.PI/180;
                      const outerR = 48;
                      const x1 = 50 + outerR * Math.cos(startAngle);
                      const y1 = 50 + outerR * Math.sin(startAngle);
                      const x2 = 50 + outerR * Math.cos(endAngle);
                      const y2 = 50 + outerR * Math.sin(endAngle);

                      const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
                      const dark = i % 2 === 0;
                      const fill = dark ? '#111827' : '#fff';

                      const mid = (startAngle + endAngle) / 2;
                      const labelRadius = BOARD_OUTER + 5;
                      const lx = 50 + labelRadius * Math.cos(mid);
                      const ly = 50 + labelRadius * Math.sin(mid);

                      return (
                        <g key={i}>
                          <path d={`M50 50 L ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={fill} stroke="#222" strokeWidth={0.25} />
                          <text x={lx} y={ly} fontSize={4} textAnchor={'middle'} dominantBaseline={'middle'} fill={dark ? '#818181ff' : '#111'}>{num}</text>
                        </g>
                      );
                    })}

                    {/* Triple ring (narrow) */}
                    <circle cx="50" cy="50" r={ (TRIPLE_OUTER + TRIPLE_INNER) / 2 } fill="none" stroke="#0f60d9" strokeWidth={TRIPLE_OUTER - TRIPLE_INNER} strokeLinejoin="round" />

                    {/* Double ring (outer, narrow) */}
                    <circle cx="50" cy="50" r={ (DOUBLE_OUTER + DOUBLE_INNER) / 2 } fill="none" stroke="#0f60d9" strokeWidth={DOUBLE_OUTER - DOUBLE_INNER} strokeLinejoin="round" />

                    {/* Outer single border and triple/single separation lines (thin) */}
                    <circle cx="50" cy="50" r={BOARD_OUTER} fill="none" stroke="#111" strokeWidth={0.6} />

                    {/* Outer Bull (25) */}
                    <circle cx="50" cy="50" r={OUTER_BULL_R} fill="#3b873e" stroke="#000" strokeWidth={0.5} />
                    {/* Inner Bull (50) */}
                    <circle cx="50" cy="50" r={INNER_BULL_R} fill="#d32f2f" stroke="#000" strokeWidth={0.5} />

                    {/* center outline */}
                    <circle cx="50" cy="50" r="49.5" fill="none" stroke="#000" strokeWidth={0.3} />

                    {/* Last-hit marker (debug) */}
                    {lastHit && (
                      <g>
                        <circle cx={lastHit.svgX} cy={lastHit.svgY} r={2.6} fill="#ff9800" stroke="#000" strokeWidth={0.4} />
                        <text x={lastHit.svgX} y={lastHit.svgY - 4.5} fontSize={2.8} textAnchor="middle" fill="#000">{lastHit.sectorNumber ? `${lastHit.mult}×${lastHit.sectorNumber}` : lastHit.rawScore}</text>
                      </g>
                    )}

                  </svg>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Text type="secondary">Нажатие на доску регистрирует бросок в указанный сектор и делает подсчёты</Text>
                </div>

                {showDebug && (
                  <Card size="small" style={{ width: '100%', marginTop: 12 }}>
                    <Title level={5}>Отладка</Title>
                    {lastHit ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div><Text strong>svgX</Text>: {lastHit.svgX.toFixed(2)}</div>
                        <div><Text strong>svgY</Text>: {lastHit.svgY.toFixed(2)}</div>
                        <div><Text strong>distSvg</Text>: {lastHit.distSvg.toFixed(2)}</div>
                        <div><Text strong>atanDeg</Text>: {lastHit.atanDeg}</div>
                        <div><Text strong>angleFromTop</Text>: {lastHit.angleFromTop}</div>
                        <div><Text strong>sectorIndex</Text>: {lastHit.sectorIndex}</div>
                        <div><Text strong>sectorNumber</Text>: {lastHit.sectorNumber ?? '-'}</div>
                        <div><Text strong>mult</Text>: {lastHit.mult}</div>
                        <div><Text strong>rawScore</Text>: {lastHit.rawScore}</div>
                      </div>
                    ) : (
                      <Text type="secondary">Пока пусто — нажмите на доску.</Text>
                    )}
                  </Card>
                )}

              </Card>

              <Card title="Ввод вручную" style={{ marginTop: 12 }}>
                {/* <Space wrap style={{ marginBottom: 8 }}>
                  {[{label: 'T20', val: 60}, {label: 'T19', val:57}, {label:'D20', val:40}, {label:'S25', val:25}, {label:'Bull', val:50}].map(b=> (
                    <Button key={b.label} onClick={()=>{
                      if(players.length===0) return;
                      if(b.label==='Bull') {
                        recordHit(activePlayerIndex, 'Яблочко (50)', 1, 50);
                        setLastHit(makeLastHit(INNER_BULL_R, 0, -INNER_BULL_R, 50, 1, 50));
                      }
                      else if(b.label.startsWith('S')){
                        const v = Number(b.label.slice(1)); recordHit(activePlayerIndex, v, 1, v);
                        setLastHit(null);
                      } else if(b.label.startsWith('D')){
                        const v = Number(b.label.slice(1)); recordHit(activePlayerIndex, v, 2, v*2);
                        setLastHit(null);
                      } else if(b.label.startsWith('T')){
                        const v = Number(b.label.slice(1)); recordHit(activePlayerIndex, v, 3, v*3);
                        setLastHit(null);
                      }
                    }}>{b.label}</Button>
                  ))}
                </Space> */}

                <Form layout="inline">
                  <Form.Item label="Сектора">
                    <Select value={manualSector} style={{ width: 120 }} onChange={(v)=>setManualSector(v as any)}>
                      <Select.Option value={'BULL'}>Яблочко (50)</Select.Option>
                      <Select.Option value={'OB'}>Внешний центр (25)</Select.Option>
                      {SECTORS.map(n => <Select.Option key={`s${n}`} value={n}>{n}</Select.Option>)}
                    </Select>
                  </Form.Item>
                  <Form.Item label="Множители">
                    <Select value={manualMult} style={{ width: 80 }} onChange={(v)=>setManualMult(Number(v))}>
                      <Select.Option value={1}>1</Select.Option>
                      <Select.Option value={2}>2</Select.Option>
                      <Select.Option value={3}>3</Select.Option>
                    </Select>
                  </Form.Item>

                  <Form.Item>
                    <Button type="primary" onClick={applyManualHit}>Записать</Button>
                  </Form.Item>
                </Form>

              </Card>

            </Col>

          </Row>

          <Modal title="Добавление игрока" open={showAddPlayer} onCancel={()=>setShowAddPlayer(false)} onOk={()=>addPlayer(newPlayerName)}>
            <Form layout="vertical">
              <Form.Item label="Имя">
                <Input value={newPlayerName} onChange={(e)=>setNewPlayerName(e.target.value)} placeholder="Введите имя игрока:" />
              </Form.Item>
            </Form>
          </Modal>

        </Content>
      </Layout>
    </ConfigProvider>
  );
}
