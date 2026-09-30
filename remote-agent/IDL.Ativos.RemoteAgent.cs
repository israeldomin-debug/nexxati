using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using Microsoft.Win32;
using System.Runtime.InteropServices;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Security.Principal;
using System.Security.Cryptography;

internal static class Program
{
    private const string Version = "1.7.1";
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    private static Dictionary<string, object> Config;
    private static string ApiUrl;
    private static string Token;
    private static string AgentName;
    private static string ProductName;
    private static int PollSeconds;
    private static int HeartbeatSeconds;
    private static int InventoryMinutes;
    private static int UpdateMinutes;
    private static DateTime LastHeartbeat = DateTime.MinValue;
    private static DateTime LastInventory = DateTime.MinValue;
    private static DateTime LastUpdateCheck = DateTime.MinValue;
    private static string UpdateStatus = "CURRENT";
    private static string UpdateTargetVersion;
    private static string UpdateError;
    private static bool UpdateStarted;
    private static Dictionary<string, object> LastAgentInfo;
    private static List<Dictionary<string, object>> InstalledApplicationsCache;
    private static DateTime InstalledApplicationsCollectedAt = DateTime.MinValue;
    private static Mutex SingleInstanceMutex;
    private static readonly List<string> CollectionWarnings = new List<string>();
    private static readonly int[] Ports = { 22, 80, 81, 82, 85, 88, 443, 515, 554, 631, 3000, 3001, 3570, 4000, 4001, 5000, 5038, 5060, 5061, 5080, 5160, 8000, 8080, 8088, 8089, 8554, 8899, 9100, 34567, 37777, 37778 };

    private static void Log(string format, params object[] args)
    {
        var message = String.Format(format, args);
        var line = String.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}", DateTime.Now, message);
        try { Console.WriteLine(line); } catch { }
        try
        {
            var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "agent.log");
            var previousPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "agent.previous.log");
            if (File.Exists(logPath) && new FileInfo(logPath).Length > 2 * 1024 * 1024)
            {
                if (File.Exists(previousPath)) File.Delete(previousPath);
                File.Move(logPath, previousPath);
            }
            File.AppendAllText(logPath, line + Environment.NewLine, Encoding.UTF8);
        }
        catch { }
    }

    private static void Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        try { Directory.SetCurrentDirectory(AppDomain.CurrentDomain.BaseDirectory); } catch { }
        var configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "agent.config.json");
        if (!File.Exists(configPath))
        {
            Log("agent.config.json não encontrado ao lado do executável.");
            return;
        }

        AppDomain.CurrentDomain.UnhandledException += (sender, args) => Log("Falha não tratada: {0}", args.ExceptionObject);
        try
        {
            Config = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(configPath, Encoding.UTF8));
            ApiUrl = Convert.ToString(Config["apiUrl"]).TrimEnd('/');
            Token = Convert.ToString(Config["token"]);
            AgentName = Convert.ToString(Config["agentName"]).Trim();
            ProductName = Config.ContainsKey("productName") ? Convert.ToString(Config["productName"]).Trim() : "IDL Ativos e Chamados";
            PollSeconds = Config.ContainsKey("pollSeconds") ? Math.Max(30, Convert.ToInt32(Config["pollSeconds"])) : 60;
            HeartbeatSeconds = Config.ContainsKey("heartbeatSeconds") ? Math.Max(30, Convert.ToInt32(Config["heartbeatSeconds"])) : 60;
            InventoryMinutes = Config.ContainsKey("inventoryMinutes") ? Math.Max(5, Convert.ToInt32(Config["inventoryMinutes"])) : 15;
            UpdateMinutes = Config.ContainsKey("updateMinutes") ? Math.Max(5, Convert.ToInt32(Config["updateMinutes"])) : 15;
            if (String.IsNullOrWhiteSpace(ApiUrl) || String.IsNullOrWhiteSpace(Token) || String.IsNullOrWhiteSpace(AgentName))
                throw new Exception("apiUrl, token e agentName são obrigatórios.");
        }
        catch (Exception ex)
        {
            Log("Falha ao carregar agent.config.json: {0}", ex.Message);
            return;
        }
        try
        {
            bool createdNew;
            SingleInstanceMutex = new Mutex(true, @"Global\IDLAtivosRemoteAgent", out createdNew);
            if (!createdNew) { Log("Outra instância do agente já está em execução. Encerrando esta cópia."); return; }
        }
        catch (Exception ex) { Log("Não foi possível validar instância única: {0}", ex.Message); }
        Log("{0} - Agente Remoto v{1}", ProductName, Version);
        Log("Local: {0} | Servidor: {1} | Consulta: {2}s | Heartbeat: {3}s | Inventário: {4}min", AgentName, ApiUrl, PollSeconds, HeartbeatSeconds, InventoryMinutes);

        while (true)
        {
            try { Work(); }
            catch (Exception ex) { Log("Falha no ciclo: {0}", ex.Message); }
            if (UpdateStarted) return;
            Thread.Sleep(PollSeconds * 1000);
        }
    }

    private static void Work()
    {
        if (LastAgentInfo == null || DateTime.UtcNow - LastInventory > TimeSpan.FromMinutes(InventoryMinutes))
        {
            LastAgentInfo = ReadMachineInventory();
            LastInventory = DateTime.UtcNow;
            Log("Inventário local atualizado: {0}", LastAgentInfo["computerName"]);
        }
        SetUpdateTelemetry();
        if (DateTime.UtcNow - LastUpdateCheck > TimeSpan.FromMinutes(UpdateMinutes) && CheckForUpdate())
        {
            SetUpdateTelemetry();
            try
            {
                Api("/remote-agent/heartbeat", "POST", new Dictionary<string, object> {
                    { "agentName", AgentName }, { "agentInfo", LastAgentInfo }
                });
            }
            catch (Exception error) { Log("Falha ao registrar o início da atualização: {0}", error.Message); }
            return;
        }
        if (DateTime.UtcNow - LastHeartbeat > TimeSpan.FromSeconds(HeartbeatSeconds))
        {
            Api("/remote-agent/heartbeat", "POST", new Dictionary<string, object> {
                { "agentName", AgentName }, { "agentInfo", LastAgentInfo }
            });
            LastHeartbeat = DateTime.UtcNow;
            Log("Heartbeat enviado com sucesso: {0}", LastAgentInfo["computerName"]);
        }
        var response = Api("/remote-agent/jobs/next?agentName=" + Uri.EscapeDataString(AgentName), "GET", null);
        var job = response.ContainsKey("job") ? response["job"] as Dictionary<string, object> : null;
        if (job == null) return;

        var id = Convert.ToString(job["id"]);
        var prefix = Convert.ToString(job["prefix"]);
        var first = Convert.ToInt32(job["firstIp"]);
        var last = Convert.ToInt32(job["lastIp"]);
        Log("Tarefa {0}: {1}.{2}-{3}", id, prefix, first, last);

        try
        {
            var agentInfo = LastAgentInfo ?? ReadMachineInventory();
            var devices = Scan(prefix, first, last);
            Api("/remote-agent/jobs/" + id + "/complete", "POST", new Dictionary<string, object> {
                { "agentName", AgentName }, { "agentInfo", agentInfo }, { "devices", devices }
            });
            Log("Concluído: {0} dispositivo(s).", devices.Count);
        }
        catch (Exception ex)
        {
            Api("/remote-agent/jobs/" + id + "/complete", "POST", new Dictionary<string, object> {
                { "agentName", AgentName }, { "agentInfo", LastAgentInfo ?? ReadMachineInventory() },
                { "devices", new object[0] }, { "error", ex.Message }
            });
            Log("Falha na tarefa: {0}", ex.Message);
        }
    }

    private static List<Dictionary<string, object>> Scan(string prefix, int first, int last)
    {
        var found = new ConcurrentBag<Dictionary<string, object>>();
        var targets = Enumerable.Range(first, last - first + 1).Select(i => prefix + "." + i).ToArray();
        var done = 0;
        Parallel.ForEach(targets, new ParallelOptions { MaxDegreeOfParallelism = 24 }, ip =>
        {
            var device = Inspect(ip);
            if (device != null) found.Add(device);
            var current = Interlocked.Increment(ref done);
            if (current % 20 == 0 || current == targets.Length)
                Log("{0}/{1} endereços verificados; {2} encontrados.", current, targets.Length, found.Count);
        });
        return found.OrderBy(item => IPAddress.Parse(Convert.ToString(item["ipAddress"])).GetAddressBytes(), ByteArrayComparer.Instance).ToList();
    }

    private static Dictionary<string, object> Inspect(string ip)
    {
        var watch = Stopwatch.StartNew();
        var pingOnline = PingOnline(ip);
        var open = Ports.Where(port => PortOpen(ip, port, 650)).ToList();
        if (!pingOnline && open.Count == 0) return null;
        var identity = HttpIdentity(ip, open);
        var hostname = identity.Item1 ?? ReverseDns(ip);
        return new Dictionary<string, object> {
            { "ipAddress", ip }, { "hostname", hostname }, { "macAddress", ArpMac(ip) },
            { "manufacturer", identity.Item2 }, { "model", identity.Item3 }, { "serialNumber", null },
            { "firmware", identity.Item4 }, { "online", true }, { "responseTimeMs", (int)watch.ElapsedMilliseconds },
            { "source", "REMOTE_AGENT_EXE_TCP_HTTP" }, { "type", Classify(open, identity.Item5) }, { "openPorts", open }
        };
    }

    private static bool PingOnline(string ip)
    {
        try { using (var ping = new Ping()) { return ping.Send(ip, 900).Status == IPStatus.Success; } }
        catch { return false; }
    }

    private static string ReverseDns(string ip)
    {
        try { return Dns.GetHostEntry(ip).HostName; }
        catch { return null; }
    }

    private static bool PortOpen(string ip, int port, int timeout)
    {
        using (var client = new TcpClient())
        {
            try
            {
                var result = client.BeginConnect(ip, port, null, null);
                var connected = result.AsyncWaitHandle.WaitOne(timeout);
                if (!connected) return false;
                client.EndConnect(result);
                return true;
            }
            catch { return false; }
        }
    }

    private static Tuple<string, string, string, string, string> HttpIdentity(string ip, List<int> open)
    {
        var port = open.FirstOrDefault(p => new[] { 80, 81, 82, 85, 88, 8000, 8080 }.Contains(p));
        if (port == 0) return Tuple.Create<string, string, string, string, string>(null, null, null, null, "");
        try
        {
            var request = (HttpWebRequest)WebRequest.Create("http://" + ip + ":" + port);
            request.Timeout = 1800;
            request.ReadWriteTimeout = 1800;
            request.AllowAutoRedirect = false;
            request.UserAgent = "IDL-Ativos-RemoteAgent/" + Version;
            using (var response = request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
            {
                var text = reader.ReadToEnd();
                if (text.Length > 120000) text = text.Substring(0, 120000);
                var title = Match(text, @"<title[^>]*>([^<]+)</title>");
                var manufacturer = Match(text, @"\b(Intelbras|Hikvision|Dahua|Axis|Giga|Topcam|Grandstream|Yealink|Cisco|Polycom|Fanvil|Khomp|Brother|Epson|HP|Canon|Lexmark|Control\s*iD|Henry|Dimep|Topdata|Madis|ZKTeco|Asterisk|FreePBX|Issabel|Elastix|3CX)\b");
                var firmware = Match(text, @"(?:firmware|software version|vers[aã]o)[\s:=_-]*([A-Za-z0-9._-]{2,40})");
                return Tuple.Create(title, manufacturer, title, firmware, (title ?? "") + " " + text);
            }
        }
        catch { return Tuple.Create<string, string, string, string, string>(null, null, null, null, ""); }
    }

    private static string Match(string input, string pattern)
    {
        var match = System.Text.RegularExpressions.Regex.Match(input ?? "", pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return match.Success ? WebUtility.HtmlDecode(match.Groups[1].Value.Trim()) : null;
    }

    private static string Classify(List<int> open, string identity)
    {
        var text = (identity ?? "").ToLowerInvariant();
        if (text.Contains("asterisk") || text.Contains("freepbx") || text.Contains("issabel") || text.Contains("elastix") || text.Contains("3cx") || text.Contains("pabx") || text.Contains(" pbx") || text.Contains("voip server") || open.Any(p => p == 5038 || p == 5080 || p == 5160 || p == 8088 || p == 8089) || (open.Any(p => p == 5060 || p == 5061) && open.Any(p => p == 22 || p == 5038 || p == 8088 || p == 8089))) return "VOIP_SERVER";
        if (text.Contains("status do relogio") || text.Contains("status do relógio") || text.Contains("relogio de ponto") || text.Contains("relógio de ponto") || text.Contains(" rep") || text.Contains("control id") || text.Contains("controlid") || text.Contains("henry") || text.Contains("dimep") || text.Contains("topdata") || text.Contains("madis") || text.Contains("zkteco")) return "TIME_CLOCK";
        if (text.Contains("telefone ip") || text.Contains("ip phone") || text.Contains("voip") || text.Contains("sip phone") || text.Contains("yealink") || text.Contains("grandstream") || text.Contains("fanvil") || text.Contains("polycom") || open.Any(p => p == 5060 || p == 5061)) return "IP_PHONE";
        if (open.Any(p => p == 9100 || p == 515 || p == 631) || text.Contains("printer") || text.Contains("impressora")) return "PRINTER";
        if (open.Any(p => p == 554 || p == 8000 || p == 8554 || p == 8899 || p == 34567 || p == 37777 || p == 37778) || text.Contains("camera") || text.Contains("onvif")) return "CAMERA";
        return "OTHER";
    }

    private static string ArpMac(string ip)
    {
        try
        {
            var process = Process.Start(new ProcessStartInfo("arp", "-a " + ip) { UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true });
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(1200);
            var match = System.Text.RegularExpressions.Regex.Match(output, @"(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            return match.Success ? match.Value.Replace('-', ':').ToUpperInvariant() : null;
        }
        catch { return null; }
    }

    private static Dictionary<string, object> ReadMachineInventory()
    {
        CollectionWarnings.Clear();
        var computer = FirstWmi("SELECT Manufacturer,Model,TotalPhysicalMemory,Domain,Workgroup,SystemType,UserName FROM Win32_ComputerSystem");
        var bios = FirstWmi("SELECT SerialNumber,SMBIOSBIOSVersion,Version,ReleaseDate FROM Win32_BIOS");
        var os = FirstWmi("SELECT Caption,Version,OSArchitecture,InstallDate,LastBootUpTime FROM Win32_OperatingSystem");
        var cpu = FirstWmi("SELECT Name,NumberOfCores,NumberOfLogicalProcessors FROM Win32_Processor");
        var enclosure = FirstWmi("SELECT ChassisTypes FROM Win32_SystemEnclosure");
        var baseBoard = FirstWmi("SELECT Manufacturer,Product,SerialNumber FROM Win32_BaseBoard");
        var videoControllers = QueryWmi("SELECT Name,AdapterRAM,DriverVersion FROM Win32_VideoController");
        var connectedPeripherals = ReadConnectedPeripherals();
        var physicalMemory = QueryWmi("SELECT Manufacturer,PartNumber,SerialNumber,Capacity,Speed FROM Win32_PhysicalMemory");
        var physicalDisks = QueryWmi("SELECT Model,SerialNumber,Size,MediaType,InterfaceType FROM Win32_DiskDrive");
        var licensingService = FirstWmi("SELECT OA3xOriginalProductKey FROM SoftwareLicensingService");
        var windowsLicense = QueryWmi("SELECT Name,Description,LicenseStatus,PartialProductKey FROM SoftwareLicensingProduct WHERE PartialProductKey IS NOT NULL")
            .FirstOrDefault(item => (Value(item, "Name") ?? "").StartsWith("Windows", StringComparison.OrdinalIgnoreCase))
            ?? new Dictionary<string, object>();
        var disks = QueryWmi("SELECT DeviceID,Size,FreeSpace FROM Win32_LogicalDisk WHERE DriveType=3").Select(d => new Dictionary<string, object> {
            { "name", Value(d, "DeviceID") }, { "sizeGb", BytesToGb(Value(d, "Size")) }, { "freeGb", BytesToGb(Value(d, "FreeSpace")) }
        }).ToList();
        if (disks.Count == 0)
            disks = DriveInfo.GetDrives().Where(d => d.IsReady && d.DriveType == DriveType.Fixed).Select(d => new Dictionary<string, object> {
                { "name", d.Name }, { "sizeGb", d.TotalSize / 1024 / 1024 / 1024 }, { "freeGb", d.AvailableFreeSpace / 1024 / 1024 / 1024 }
            }).ToList();
        var adapters = NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .Select(n => new Dictionary<string, object> {
                { "name", n.Name },
                { "description", n.Description },
                { "ipAddresses", n.GetIPProperties().UnicastAddresses.Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork).Select(a => a.Address.ToString()).ToArray() },
                { "gatewayAddresses", n.GetIPProperties().GatewayAddresses.Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork).Select(a => a.Address.ToString()).ToArray() },
                { "macAddress", FormatMac(n.GetPhysicalAddress().GetAddressBytes()) },
                { "isVirtual", IsVirtualAdapter(n.Name + " " + n.Description) }
            }).ToList();
        var lastBoot = Value(os, "LastBootUpTime");
        try { if (!String.IsNullOrWhiteSpace(lastBoot)) lastBoot = ManagementDateTimeConverter.ToDateTime(lastBoot).ToUniversalTime().ToString("o"); } catch { }
        var windowsInstallDate = Value(os, "InstallDate");
        try { if (!String.IsNullOrWhiteSpace(windowsInstallDate)) windowsInstallDate = ManagementDateTimeConverter.ToDateTime(windowsInstallDate).ToUniversalTime().ToString("o"); } catch { }
        var biosReleaseDate = Value(bios, "ReleaseDate");
        try { if (!String.IsNullOrWhiteSpace(biosReleaseDate)) biosReleaseDate = ManagementDateTimeConverter.ToDateTime(biosReleaseDate).ToString("yyyy-MM-dd"); } catch { }
        var manufacturer = Value(computer, "Manufacturer") ?? RegistryText(@"HARDWARE\DESCRIPTION\System\BIOS", "SystemManufacturer");
        var model = Value(computer, "Model") ?? RegistryText(@"HARDWARE\DESCRIPTION\System\BIOS", "SystemProductName");
        var serial = Value(bios, "SerialNumber") ?? RegistryText(@"HARDWARE\DESCRIPTION\System\BIOS", "SystemSerialNumber");
        var osName = Value(os, "Caption") ?? RegistryText(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "ProductName");
        var osVersion = Value(os, "Version") ?? RegistryText(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "DisplayVersion") ?? Environment.OSVersion.VersionString;
        var processor = Value(cpu, "Name") ?? RegistryText(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0", "ProcessorNameString");
        var memoryMb = BytesToMb(Value(computer, "TotalPhysicalMemory"));
        if (memoryMb == 0) memoryMb = TotalMemoryMb();
        var windowsProductKey = Value(licensingService, "OA3xOriginalProductKey")
            ?? RegistryText(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\SoftwareProtectionPlatform", "BackupProductKeyDefault");
        var windowsProductKeyPartial = Value(windowsLicense, "PartialProductKey");
        if (String.IsNullOrWhiteSpace(windowsProductKeyPartial) && !String.IsNullOrWhiteSpace(windowsProductKey) && windowsProductKey.Length >= 5)
            windowsProductKeyPartial = windowsProductKey.Substring(windowsProductKey.Length - 5);
        var chassisTypes = new List<int>();
        if (enclosure.ContainsKey("ChassisTypes") && enclosure["ChassisTypes"] is ushort[])
            chassisTypes.AddRange(((ushort[])enclosure["ChassisTypes"]).Select(value => (int)value));
        var portableChassis = new[] { 8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32 };
        var isNotebook = chassisTypes.Any(portableChassis.Contains) || QueryWmi("SELECT DeviceID FROM Win32_Battery").Count > 0;
        var deviceType = (osName ?? "").IndexOf("Server", StringComparison.OrdinalIgnoreCase) >= 0 ? "SERVER" : isNotebook ? "NOTEBOOK" : "DESKTOP";
        var installedApplications = ReadInstalledApplications();
        return new Dictionary<string, object> {
            { "computerName", Environment.MachineName }, { "manufacturer", manufacturer },
            { "model", model }, { "serialNumber", serial },
            { "operatingSystem", osName }, { "osVersion", osVersion },
            { "architecture", Value(os, "OSArchitecture") ?? (Environment.Is64BitOperatingSystem ? "64 bits" : "32 bits") }, { "processor", processor },
            { "cpuCores", ToInt(Value(cpu, "NumberOfCores")) }, { "cpuLogicalProcessors", ToInt(Value(cpu, "NumberOfLogicalProcessors")) },
            { "memoryMb", memoryMb }, { "disks", disks },
            { "physicalDisks", physicalDisks }, { "memoryModules", physicalMemory }, { "videoControllers", videoControllers },
            { "connectedPeripherals", connectedPeripherals },
            { "baseBoardManufacturer", Value(baseBoard, "Manufacturer") }, { "baseBoardModel", Value(baseBoard, "Product") }, { "baseBoardSerialNumber", Value(baseBoard, "SerialNumber") },
            { "loggedUser", Value(computer, "UserName") ?? (Environment.UserDomainName + "\\" + Environment.UserName) }, { "domain", Value(computer, "Domain") ?? Environment.UserDomainName },
            { "workgroup", Value(computer, "Workgroup") }, { "systemType", Value(computer, "SystemType") },
            { "biosVersion", String.Join(" - ", new[] { Value(bios, "SMBIOSBIOSVersion"), Value(bios, "Version") }.Where(value => !String.IsNullOrWhiteSpace(value)).Distinct()) },
            { "biosReleaseDate", biosReleaseDate }, { "windowsInstallDate", windowsInstallDate },
            { "lastBootAt", lastBoot }, { "networkAdapters", adapters }, { "agentVersion", Version },
            { "deviceType", deviceType }, { "chassisTypes", chassisTypes },
            { "windowsLicenseStatus", ToInt(Value(windowsLicense, "LicenseStatus")) },
            { "windowsProductKeyPartial", windowsProductKeyPartial },
            { "windowsLicenseDescription", Value(windowsLicense, "Description") },
            { "windowsProductKey", windowsProductKey },
            { "installedApplications", installedApplications },
            { "installedApplicationCount", installedApplications.Count },
            { "elevated", IsElevated() }, { "collectionWarnings", CollectionWarnings.ToArray() }
        };
    }

    private static List<Dictionary<string, object>> ReadInstalledApplications()
    {
        if (InstalledApplicationsCache != null && DateTime.UtcNow - InstalledApplicationsCollectedAt < TimeSpan.FromMinutes(30))
            return InstalledApplicationsCache;

        var applications = new Dictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
        ReadUninstallRoot(RegistryHive.LocalMachine, RegistryView.Registry64, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", applications);
        ReadUninstallRoot(RegistryHive.LocalMachine, RegistryView.Registry32, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", applications);
        ReadUninstallRoot(RegistryHive.CurrentUser, RegistryView.Default, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", applications);

        try
        {
            using (var users = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Default))
                foreach (var sid in users.GetSubKeyNames().Where(name => name.StartsWith("S-1-5-21-", StringComparison.OrdinalIgnoreCase)))
                    ReadUninstallKey(users, sid + @"\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", applications);
        }
        catch (Exception error) { CollectionWarnings.Add("Aplicativos de outros usuários: " + error.Message); }

        InstalledApplicationsCache = applications.Values
            .OrderBy(item => Convert.ToString(item["name"]), StringComparer.CurrentCultureIgnoreCase)
            .ToList();
        InstalledApplicationsCollectedAt = DateTime.UtcNow;
        return InstalledApplicationsCache;
    }

    private static void ReadUninstallRoot(RegistryHive hive, RegistryView view, string path, Dictionary<string, Dictionary<string, object>> applications)
    {
        try
        {
            using (var root = RegistryKey.OpenBaseKey(hive, view)) ReadUninstallKey(root, path, applications);
        }
        catch (Exception error) { CollectionWarnings.Add("Aplicativos " + hive + "/" + view + ": " + error.Message); }
    }

    private static void ReadUninstallKey(RegistryKey root, string path, Dictionary<string, Dictionary<string, object>> applications)
    {
        using (var uninstall = root.OpenSubKey(path))
        {
            if (uninstall == null) return;
            foreach (var subKeyName in uninstall.GetSubKeyNames())
            {
                try
                {
                    using (var item = uninstall.OpenSubKey(subKeyName))
                    {
                        if (item == null) continue;
                        var name = Convert.ToString(item.GetValue("DisplayName", "")).Trim();
                        if (String.IsNullOrWhiteSpace(name)) continue;
                        int systemComponent;
                        if (Int32.TryParse(Convert.ToString(item.GetValue("SystemComponent", "0")), out systemComponent) && systemComponent == 1) continue;
                        var version = Convert.ToString(item.GetValue("DisplayVersion", "")).Trim();
                        var publisher = Convert.ToString(item.GetValue("Publisher", "")).Trim();
                        var installDate = Convert.ToString(item.GetValue("InstallDate", "")).Trim();
                        var identity = name + "\u001f" + version + "\u001f" + publisher;
                        if (applications.ContainsKey(identity)) continue;
                        applications[identity] = new Dictionary<string, object> {
                            { "name", name },
                            { "version", String.IsNullOrWhiteSpace(version) ? null : version },
                            { "publisher", String.IsNullOrWhiteSpace(publisher) ? null : publisher },
                            { "installDate", String.IsNullOrWhiteSpace(installDate) ? null : installDate }
                        };
                    }
                }
                catch { }
            }
        }
    }

    private static Dictionary<string, object> MachineAsDevice(Dictionary<string, object> info)
    {
        var adapters = info["networkAdapters"] as List<Dictionary<string, object>>;
        var adapter = adapters == null ? null : adapters.FirstOrDefault(a => ((string[])a["ipAddresses"]).Length > 0);
        if (adapter == null) return null;
        var ip = ((string[])adapter["ipAddresses"]).FirstOrDefault();
        if (String.IsNullOrWhiteSpace(ip)) return null;
        var os = Convert.ToString(info["operatingSystem"]);
        return new Dictionary<string, object> {
            { "ipAddress", ip }, { "hostname", info["computerName"] }, { "macAddress", adapter["macAddress"] },
            { "manufacturer", info["manufacturer"] }, { "model", info["model"] }, { "serialNumber", info["serialNumber"] },
            { "firmware", null }, { "online", true }, { "responseTimeMs", 0 }, { "source", "REMOTE_AGENT_HOST" },
            { "type", os.IndexOf("Server", StringComparison.OrdinalIgnoreCase) >= 0 ? "SERVER" : "DESKTOP" },
            { "openPorts", new int[0] }
        };
    }

    private static Dictionary<string, object> FirstWmi(string query) { return QueryWmi(query).FirstOrDefault() ?? new Dictionary<string, object>(); }
    private static List<Dictionary<string, object>> QueryWmi(string query)
    {
        return QueryWmiNamespace(@"root\cimv2", query);
    }
    private static List<Dictionary<string, object>> QueryWmiNamespace(string scope, string query)
    {
        var list = new List<Dictionary<string, object>>();
        try
        {
            using (var searcher = new ManagementObjectSearcher(scope, query))
                foreach (ManagementObject item in searcher.Get())
                {
                    var row = new Dictionary<string, object>();
                    foreach (PropertyData property in item.Properties) row[property.Name] = property.Value;
                    list.Add(row);
                }
        }
        catch (Exception error) { CollectionWarnings.Add(query.Split(' ').Last() + ": " + error.Message); }
        return list;
    }

    private static List<Dictionary<string, object>> ReadConnectedPeripherals()
    {
        var result = new List<Dictionary<string, object>>();
        var identities = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var monitor in QueryWmiNamespace(@"root\wmi", "SELECT Active,InstanceName,ManufacturerName,ProductCodeID,SerialNumberID,UserFriendlyName FROM WmiMonitorID"))
        {
            var deviceId = Value(monitor, "InstanceName");
            var name = DecodeMonitorText(monitor.ContainsKey("UserFriendlyName") ? monitor["UserFriendlyName"] : null);
            var model = DecodeMonitorText(monitor.ContainsKey("ProductCodeID") ? monitor["ProductCodeID"] : null);
            var serial = DecodeMonitorText(monitor.ContainsKey("SerialNumberID") ? monitor["SerialNumberID"] : null);
            var manufacturer = DecodeMonitorText(monitor.ContainsKey("ManufacturerName") ? monitor["ManufacturerName"] : null);
            AddPeripheral(result, identities, "MONITOR", name ?? model ?? "Monitor", manufacturer, model, serial, deviceId);
        }

        foreach (var mouse in QueryWmi("SELECT Name,Manufacturer,DeviceID,PNPDeviceID,Status FROM Win32_PointingDevice"))
            AddPeripheral(result, identities, "MOUSE", Value(mouse, "Name") ?? "Mouse", Value(mouse, "Manufacturer"), null, null, Value(mouse, "PNPDeviceID") ?? Value(mouse, "DeviceID"));

        foreach (var keyboard in QueryWmi("SELECT Name,Description,DeviceID,PNPDeviceID,Status FROM Win32_Keyboard"))
            AddPeripheral(result, identities, "KEYBOARD", Value(keyboard, "Name") ?? Value(keyboard, "Description") ?? "Teclado", null, null, null, Value(keyboard, "PNPDeviceID") ?? Value(keyboard, "DeviceID"));

        return result.OrderBy(item => Convert.ToString(item["kind"])).ThenBy(item => Convert.ToString(item["name"])).ToList();
    }

    private static void AddPeripheral(List<Dictionary<string, object>> result, HashSet<string> identities, string kind, string name, string manufacturer, string model, string serialNumber, string deviceId)
    {
        var identity = kind + "|" + (serialNumber ?? deviceId ?? name);
        if (!identities.Add(identity)) return;
        result.Add(new Dictionary<string, object> {
            { "kind", kind }, { "name", name }, { "manufacturer", manufacturer }, { "model", model },
            { "serialNumber", serialNumber }, { "deviceId", deviceId }
        });
    }

    private static string DecodeMonitorText(object value)
    {
        if (value == null) return null;
        var numbers = value as ushort[];
        if (numbers == null) return Convert.ToString(value).Trim();
        var text = new string(numbers.Where(number => number > 0).Select(number => (char)number).ToArray()).Trim();
        return String.IsNullOrWhiteSpace(text) ? null : text;
    }
    private static string Value(Dictionary<string, object> row, string key) { return row.ContainsKey(key) && row[key] != null ? Convert.ToString(row[key]).Trim() : null; }
    private static long BytesToMb(string value) { long bytes; return Int64.TryParse(value, out bytes) ? bytes / 1024 / 1024 : 0; }
    private static long BytesToGb(string value) { long bytes; return Int64.TryParse(value, out bytes) ? bytes / 1024 / 1024 / 1024 : 0; }
    private static int ToInt(string value) { int result; return Int32.TryParse(value, out result) ? result : 0; }
    private static bool IsVirtualAdapter(string value) { return System.Text.RegularExpressions.Regex.IsMatch(value ?? "", "virtual|vethernet|hyper-v|vpn|loopback|docker|wsl|vmware|virtualbox", System.Text.RegularExpressions.RegexOptions.IgnoreCase); }
    private static bool IsElevated()
    {
        try { return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator); }
        catch { return false; }
    }
    private static string FormatMac(byte[] bytes) { return bytes == null || bytes.Length == 0 ? null : String.Join(":", bytes.Select(b => b.ToString("X2"))); }
    private static string RegistryText(string path, string name)
    {
        try { using (var key = Registry.LocalMachine.OpenSubKey(path)) { var value = key == null ? null : key.GetValue(name); return value == null ? null : Convert.ToString(value).Trim(); } }
        catch { return null; }
    }
    private static long TotalMemoryMb()
    {
        try { var status = new MemoryStatus(); if (GlobalMemoryStatusEx(status)) return (long)(status.TotalPhysical / 1024 / 1024); } catch { }
        return 0;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private sealed class MemoryStatus
    {
        public uint Length = (uint)Marshal.SizeOf(typeof(MemoryStatus));
        public uint MemoryLoad;
        public ulong TotalPhysical;
        public ulong AvailablePhysical;
        public ulong TotalPageFile;
        public ulong AvailablePageFile;
        public ulong TotalVirtual;
        public ulong AvailableVirtual;
        public ulong AvailableExtendedVirtual;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx([In, Out] MemoryStatus buffer);

    private static void SetUpdateTelemetry()
    {
        if (LastAgentInfo == null) return;
        LastAgentInfo["updateStatus"] = UpdateStatus;
        LastAgentInfo["updateTargetVersion"] = UpdateTargetVersion;
        LastAgentInfo["updateError"] = UpdateError;
        LastAgentInfo["lastUpdateCheckAt"] = LastUpdateCheck == DateTime.MinValue ? null : LastUpdateCheck.ToString("o");
    }

    private static bool CheckForUpdate()
    {
        LastUpdateCheck = DateTime.UtcNow;
        string candidatePath = null;
        try
        {
            var response = Api("/remote-agent/update?currentVersion=" + Uri.EscapeDataString(Version), "GET", null);
            var update = response.ContainsKey("update") ? response["update"] as Dictionary<string, object> : null;
            if (update == null || !update.ContainsKey("available") || !Convert.ToBoolean(update["available"]))
            {
                UpdateStatus = "CURRENT";
                UpdateTargetVersion = update != null && update.ContainsKey("latestVersion") ? Convert.ToString(update["latestVersion"]) : Version;
                UpdateError = null;
                return false;
            }

            var latestVersion = Convert.ToString(update["latestVersion"]);
            var expectedHash = Convert.ToString(update["sha256"]).Trim().ToLowerInvariant();
            var downloadUrl = Convert.ToString(update["downloadUrl"]);
            if (String.IsNullOrWhiteSpace(latestVersion) || expectedHash.Length != 64 || !downloadUrl.StartsWith("/remote-agent/update/", StringComparison.Ordinal))
                throw new Exception("Manifesto de atualização inválido");

            UpdateStatus = "DOWNLOADING";
            UpdateTargetVersion = latestVersion;
            UpdateError = null;
            SetUpdateTelemetry();
            Log("Baixando atualização do agente v{0}", latestVersion);

            var executablePath = Process.GetCurrentProcess().MainModule.FileName;
            candidatePath = executablePath + ".update";
            DownloadUpdate(downloadUrl, candidatePath);
            var downloadedHash = FileSha256(candidatePath);
            if (!String.Equals(downloadedHash, expectedHash, StringComparison.OrdinalIgnoreCase))
                throw new Exception("SHA-256 do executável baixado não corresponde ao manifesto");

            var scriptPath = Path.Combine(Path.GetDirectoryName(executablePath), "agent-update.ps1");
            WriteUpdaterScript(scriptPath);
            UpdateStatus = "INSTALLING";
            SetUpdateTelemetry();
            StartUpdater(scriptPath, candidatePath, executablePath);
            UpdateStarted = true;
            Log("Atualização v{0} validada; o agente será reiniciado", latestVersion);
            return true;
        }
        catch (Exception error)
        {
            UpdateStatus = "FAILED";
            UpdateError = error.Message;
            if (!String.IsNullOrWhiteSpace(candidatePath)) try { if (File.Exists(candidatePath)) File.Delete(candidatePath); } catch { }
            Log("Falha na atualização automática: {0}", error.Message);
            return false;
        }
    }

    private static void DownloadUpdate(string relativePath, string destination)
    {
        var request = (HttpWebRequest)WebRequest.Create(ApiUrl + relativePath);
        request.Method = "GET";
        request.Headers["x-agent-token"] = Token;
        request.Timeout = 120000;
        using (var response = request.GetResponse())
        using (var input = response.GetResponseStream())
        using (var output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None))
            input.CopyTo(output);
    }

    private static string FileSha256(string filePath)
    {
        using (var stream = File.OpenRead(filePath))
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    private static void WriteUpdaterScript(string scriptPath)
    {
        var lines = new[] {
            "param([int]$ProcessId,[string]$Candidate,[string]$Target,[string]$TaskName)",
            "$ErrorActionPreference = 'Stop'",
            "$backup = $Target + '.previous'",
            "$log = Join-Path (Split-Path -Parent $Target) 'agent-update.log'",
            "try {",
            "  Wait-Process -Id $ProcessId -ErrorAction SilentlyContinue",
            "  Start-Sleep -Milliseconds 700",
            "  if (Test-Path -LiteralPath $Target) { Copy-Item -LiteralPath $Target -Destination $backup -Force }",
            "  Move-Item -LiteralPath $Candidate -Destination $Target -Force",
            "  Unblock-File -LiteralPath $Target -ErrorAction SilentlyContinue",
            "  Start-ScheduledTask -TaskName $TaskName",
            "  Start-Sleep -Seconds 5",
            "  $running = Get-CimInstance Win32_Process -Filter \"Name='IDL-Ativos-Agent.exe'\" -ErrorAction SilentlyContinue",
            "  if (-not $running) { throw 'A nova versão não permaneceu em execução' }",
            "  Add-Content -LiteralPath $log -Value \"[$(Get-Date -Format s)] Atualização concluída\"",
            "} catch {",
            "  Add-Content -LiteralPath $log -Value \"[$(Get-Date -Format s)] Falha: $($_.Exception.Message)\"",
            "  if (Test-Path -LiteralPath $backup) { Copy-Item -LiteralPath $backup -Destination $Target -Force }",
            "  Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue",
            "}"
        };
        File.WriteAllText(scriptPath, String.Join(Environment.NewLine, lines), Encoding.UTF8);
    }

    private static string QuoteArgument(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }

    private static void StartUpdater(string scriptPath, string candidatePath, string executablePath)
    {
        var start = new ProcessStartInfo {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " + QuoteArgument(scriptPath)
                + " -ProcessId " + Process.GetCurrentProcess().Id
                + " -Candidate " + QuoteArgument(candidatePath)
                + " -Target " + QuoteArgument(executablePath)
                + " -TaskName " + QuoteArgument("IDL Ativos e Chamados - Agente"),
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        };
        Process.Start(start);
    }

    private static Dictionary<string, object> Api(string path, string method, object body)
    {
        var request = (HttpWebRequest)WebRequest.Create(ApiUrl + path);
        request.Method = method;
        request.ContentType = "application/json";
        request.Headers["x-agent-token"] = Token;
        request.Timeout = 30000;
        if (body != null)
        {
            var bytes = Encoding.UTF8.GetBytes(Json.Serialize(body));
            using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
        }
        try
        {
            using (var response = request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
                return Json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
        }
        catch (WebException ex)
        {
            var response = ex.Response as HttpWebResponse;
            if (response == null) throw;
            using (var reader = new StreamReader(response.GetResponseStream()))
                throw new Exception(((int)response.StatusCode) + ": " + reader.ReadToEnd());
        }
    }

    private sealed class ByteArrayComparer : IComparer<byte[]>
    {
        public static readonly ByteArrayComparer Instance = new ByteArrayComparer();
        public int Compare(byte[] x, byte[] y)
        {
            for (var i = 0; i < Math.Min(x.Length, y.Length); i++) if (x[i] != y[i]) return x[i].CompareTo(y[i]);
            return x.Length.CompareTo(y.Length);
        }
    }
}
